/**
 * AST 缓存模块
 *
 * 基于文件内容 hash 的 AST 缓存机制，避免重复解析相同内容的文件。
 * 缓存存储为 JSON 格式，便于调试和手动检查。
 *
 * 支持多项目缓存管理，每个项目使用独立的缓存实例，避免缓存污染。
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ParsedAST } from '../ast/parser.js';
import { logger } from '../utils/logger.js';

/** 缓存格式版本 - 版本变更时自动失效旧缓存 */
const CACHE_VERSION = '1.0.0';

/** 默认最大缓存时间：7 天（毫秒） */
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** 缓存条目 */
export interface CachedAST {
  /** 文件内容的 hash */
  hash: string;
  /** 解析后的 AST（序列化为 JSON） */
  ast: unknown;
  /** 缓存时间戳 */
  timestamp: number;
}

/** 缓存存储结构 */
export interface CacheStore {
  /** 缓存格式版本 */
  version: string;
  /** 缓存条目映射 */
  entries: Record<string, CachedAST>;
}

/** 缓存配置选项 */
export interface CacheOptions {
  /** 是否启用缓存，默认 true */
  enabled: boolean;
  /** 最大缓存时间（毫秒），默认 7 天 */
  maxAge?: number;
  /** 缓存存储目录 */
  cacheDir?: string;
}

/**
 * 计算文件内容的 hash
 *
 * @param content - 文件内容
 * @returns SHA256 hash 字符串（前 16 位）
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * 获取默认缓存目录
 *
 * 优先使用环境变量 AST_LINT_CACHE_DIR，否则使用项目根目录下的 .ast-lint/cache
 *
 * @param projectRoot - 项目根目录
 * @returns 缓存目录路径
 */
export function getDefaultCacheDir(projectRoot: string): string {
  return process.env.AST_LINT_CACHE_DIR ?? path.join(projectRoot, '.ast-lint', 'cache');
}

/**
 * 获取缓存文件路径
 *
 * @param cacheDir - 缓存目录
 * @returns 缓存文件完整路径
 */
export function getCacheFilePath(cacheDir: string): string {
  return path.join(cacheDir, 'ast-cache.json');
}

/**
 * AST 缓存管理器
 *
 * 提供缓存的读取、写入、保存和加载功能。
 * 支持基于内容 hash 和时间的缓存失效策略。
 */
export class AstCache {
  private store: CacheStore;
  private cacheFilePath: string;
  private options: CacheOptions;
  private isDirty: boolean = false;
  private projectRoot: string;

  /**
   * 创建缓存管理器实例
   *
   * @param projectRoot - 项目根目录
   * @param options - 缓存配置选项
   */
  constructor(projectRoot: string, options: Partial<CacheOptions> = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      enabled: options.enabled ?? true,
      maxAge: options.maxAge ?? DEFAULT_MAX_AGE,
      cacheDir: options.cacheDir ?? getDefaultCacheDir(projectRoot),
    };
    this.cacheFilePath = getCacheFilePath(this.options.cacheDir!);
    this.store = {
      version: CACHE_VERSION,
      entries: {},
    };
  }

  /**
   * 获取缓存是否启用
   */
  get enabled(): boolean {
    return this.options.enabled;
  }

  /**
   * 从文件加载缓存
   *
   * 如果缓存文件不存在或格式无效，将初始化空缓存。
   */
  async load(): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    try {
      const content = await fs.readFile(this.cacheFilePath, 'utf8');
      const parsed = JSON.parse(content) as CacheStore;

      // 验证版本兼容性
      if (parsed.version !== CACHE_VERSION) {
        logger.verbose(`缓存版本不匹配 (${parsed.version} != ${CACHE_VERSION})，将创建新缓存`);
        return; // 版本不匹配，使用空缓存
      }

      this.store = parsed;

      // 清理过期缓存
      await this.cleanExpired();

      logger.verbose(`已加载 ${Object.keys(this.store.entries).length} 个缓存条目`);
    } catch (err) {
      // 文件不存在或解析失败，使用空缓存
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        logger.verbose(`加载缓存失败: ${error.message}`);
      }
    }
  }

  /**
   * 保存缓存到文件
   */
  async save(): Promise<void> {
    if (!this.options.enabled || !this.isDirty) {
      return;
    }

    try {
      // 确保缓存目录存在
      await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });

      // 写入缓存文件（格式化 JSON 便于调试）
      const content = JSON.stringify(this.store, null, 2);
      await fs.writeFile(this.cacheFilePath, content, 'utf8');

      this.isDirty = false;

      logger.verbose(`已保存 ${Object.keys(this.store.entries).length} 个缓存条目`);
    } catch (err) {
      logger.verbose(`保存缓存失败: ${(err as Error).message}`);
    }
  }

  /**
   * 获取缓存的 AST
   *
   * @param filePath - 文件路径（相对于项目根目录）
   * @param contentHash - 文件内容的 hash
   * @returns 缓存的 AST，如果不存在或已失效则返回 null
   */
  get(filePath: string, contentHash: string): ParsedAST | null {
    if (!this.options.enabled) {
      return null;
    }

    const entry = this.store.entries[filePath];

    if (!entry) {
      return null;
    }

    // 检查 hash 是否匹配
    if (entry.hash !== contentHash) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry.timestamp)) {
      delete this.store.entries[filePath];
      this.isDirty = true;
      return null;
    }

    return entry.ast as ParsedAST;
  }

  /**
   * 设置缓存的 AST
   *
   * @param filePath - 文件路径（相对于项目根目录）
   * @param contentHash - 文件内容的 hash
   * @param ast - 解析后的 AST
   */
  set(filePath: string, contentHash: string, ast: ParsedAST): void {
    if (!this.options.enabled) {
      return;
    }

    this.store.entries[filePath] = {
      hash: contentHash,
      ast,
      timestamp: Date.now(),
    };
    this.isDirty = true;
  }

  /**
   * 检查缓存条目是否过期
   *
   * @param timestamp - 缓存时间戳
   * @returns 是否已过期
   */
  private isExpired(timestamp: number): boolean {
    const maxAge = this.options.maxAge ?? DEFAULT_MAX_AGE;
    return Date.now() - timestamp > maxAge;
  }

  /**
   * 清理过期的缓存条目
   */
  private async cleanExpired(): Promise<void> {
    const entries = this.store.entries;
    const keys = Object.keys(entries);
    let cleaned = 0;

    for (const key of keys) {
      if (this.isExpired(entries[key].timestamp)) {
        delete entries[key];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.isDirty = true;
      logger.verbose(`已清理 ${cleaned} 个过期缓存条目`);
    }
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.store.entries = {};
    this.isDirty = true;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { total: number; size: number } {
    const entries = this.store.entries;
    const total = Object.keys(entries).length;
    const size = JSON.stringify(entries).length;
    return { total, size };
  }
}

// 使用 Map 管理多项目缓存，避免单例模式在多项目切换时的缓存污染
const cacheInstances = new Map<string, AstCache>();

/** 最大缓存实例数，防止内存泄漏 */
const MAX_CACHE_INSTANCES = 10;

/**
 * 获取或创建缓存实例
 *
 * 使用 Map 管理多项目缓存，每个项目使用独立的缓存实例。
 * 当缓存实例数超过 MAX_CACHE_INSTANCES 时，会清理最旧的实例。
 *
 * @param projectRoot - 项目根目录
 * @param options - 缓存配置选项
 * @returns 缓存管理器实例
 */
export function getAstCache(projectRoot: string, options?: Partial<CacheOptions>): AstCache {
  // 规范化项目路径，确保路径格式一致
  const normalizedRoot = path.resolve(projectRoot);

  // 检查是否已存在缓存实例
  const existingCache = cacheInstances.get(normalizedRoot);
  if (existingCache) {
    return existingCache;
  }

  // 创建新的缓存实例
  const newCache = new AstCache(normalizedRoot, options);
  cacheInstances.set(normalizedRoot, newCache);

  // 清理过多的缓存实例（LRU 策略）
  if (cacheInstances.size > MAX_CACHE_INSTANCES) {
    // 删除最早的实例
    const oldestKey = cacheInstances.keys().next().value;
    if (oldestKey) {
      cacheInstances.delete(oldestKey);
      logger.verbose(`已清理项目缓存: ${oldestKey}`);
    }
  }

  return newCache;
}

/**
 * 重置指定项目的缓存实例
 *
 * @param projectRoot - 项目根目录，如果不指定则重置所有
 */
export function resetAstCache(projectRoot?: string): void {
  if (projectRoot) {
    const normalizedRoot = path.resolve(projectRoot);
    cacheInstances.delete(normalizedRoot);
  } else {
    cacheInstances.clear();
  }
}

/**
 * 获取当前缓存实例数量（主要用于调试）
 */
export function getCacheInstanceCount(): number {
  return cacheInstances.size;
}
