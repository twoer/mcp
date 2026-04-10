import fs from 'node:fs/promises';
import path from 'node:path';

import type { AstLintConfig } from '../config/types.js';
import type { ChangedFile } from '../git/collect.js';
import type { Issue } from './types.js';
import type { AstRuleContext } from './rule-registry.js';
import type { BaseASTNode } from './ast-types.js';
import type { ParsedAST } from './parser.js';
import { BUILTIN_RULES } from './rule-registry.js';
import { getActiveRuleIds, getRuleConfig } from './rule-config.js';
import { traverseAst } from './ast-traverser.js';
import { parseCode } from './parser.js';
import { AstCache, computeContentHash } from '../cache/ast-cache.js';

/** 默认并发数 */
const DEFAULT_CONCURRENCY = 5;

/**
 * 解析文件中的忽略注释
 * 格式：// ast-lint-disable-next-line <ruleId> -- <reason>
 * 返回：Map<行号, Set<规则ID>>
 */
function parseIgnoreComments(code: string): Map<number, Set<string>> {
  const ignoreMap = new Map<number, Set<string>>();
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 匹配忽略注释：// ast-lint-disable-next-line <ruleId>
    const match = line.match(/\/\/\s*ast-lint-disable-next-line\s+([\w/-]+)/);
    if (match) {
      const ruleId = match[1];
      const nextLine = i + 2; // 下一行（行号从 1 开始）
      if (!ignoreMap.has(nextLine)) {
        ignoreMap.set(nextLine, new Set());
      }
      ignoreMap.get(nextLine)!.add(ruleId);
    }
  }

  return ignoreMap;
}

/** AST 分析运行时选项 */
export interface AstRunOptions {
  /** 是否使用缓存（覆盖配置） */
  useCache?: boolean;
  /** 是否启用增量分析（只报告变更行的问题） */
  incremental?: boolean;
}

/**
 * 简单的并发控制函数
 * 限制同时执行的 Promise 数量
 */
async function limitConcurrency<T, R>(
  items: T[],
  limit: number,
  processor: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = processor(item).then((result) => {
      results.push(result);
    });

    const wrapped = promise.then(() => {
      const index = executing.indexOf(wrapped);
      if (index > -1) {
        executing.splice(index, 1);
      }
    });

    executing.push(wrapped);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * 处理单个文件的 AST 分析
 *
 * 读取文件内容、解析 AST、运行所有启用的规则，并收集发现的问题。
 * 支持基于内容 hash 的 AST 缓存。
 *
 * @param file - 待分析的文件信息
 * @param projectRoot - 项目根目录的绝对路径
 * @param config - AST Lint 配置对象
 * @param activeRuleIds - 需要运行的规则 ID 列表
 * @param cache - 可选的 AST 缓存实例
 * @returns 该文件中发现的所有问题列表
 */
async function processFile(
  file: ChangedFile,
  projectRoot: string,
  config: AstLintConfig,
  activeRuleIds: string[],
  cache?: AstCache,
  incremental?: boolean,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const fullPath = path.join(projectRoot, file.path);

  let code: string;
  try {
    code = await fs.readFile(fullPath, 'utf8');
  } catch (err) {
    if (process.env.AST_LINT_VERBOSE) {
      console.warn(`[ast-lint] 跳过文件 ${file.path}: 读取失败 - ${(err as Error).message}`);
    }
    return issues;
  }

  // 解析忽略注释
  const ignoreMap = parseIgnoreComments(code);

  const isVueFile = file.path.endsWith('.vue');
  // 确定文件类型
  const fileType = file.path.endsWith('.css') ? 'css' :
                   file.path.endsWith('.scss') ? 'scss' :
                   file.path.endsWith('.sass') ? 'sass' :
                   file.path.endsWith('.less') ? 'less' : 'ts';

  // 计算内容 hash
  const contentHash = computeContentHash(code);

  // 尝试从缓存获取 AST
  let ast: ParsedAST | null = cache?.get(file.path, contentHash) ?? null;

  if (ast) {
    if (process.env.AST_LINT_VERBOSE) {
      console.warn(`[ast-lint] 命中缓存: ${file.path}`);
    }
  } else {
    // 缓存未命中，解析 AST
    try {
      ast = parseCode(code, isVueFile, fileType);
      // 存入缓存
      cache?.set(file.path, contentHash, ast);
    } catch (err) {
      if (process.env.AST_LINT_VERBOSE) {
        console.warn(`[ast-lint] 文件 ${file.path}: AST 解析失败，仍执行文件级规则 - ${(err as Error).message}`);
      }
      // AST 解析失败时，仍执行只依赖文件内容的规则（Program:exit 钩子）
      for (const ruleId of activeRuleIds) {
        const rule = BUILTIN_RULES[ruleId];
        if (!rule) continue;
        const fileIssues: Issue[] = [];
        const ruleCfg = getRuleConfig(ruleId, config);
        const configSeverity = ruleCfg?.severity;
        const ruleOptions = ruleCfg?.params;
        const context: AstRuleContext = {
          filePath: file.path,
          projectRoot,
          config,
          ruleOptions,
          report: (issueWithoutFile) => {
            fileIssues.push({ file: file.path, ...issueWithoutFile, severity: configSeverity ?? issueWithoutFile.severity });
          },
        };
        const visitor = rule.create(context);
        const exitHandler = (visitor as Record<string, unknown>)['Program:exit'];
        if (exitHandler && typeof exitHandler === 'function') {
          const result = (exitHandler as (node: unknown) => void | Promise<void>)({});
          if (result instanceof Promise) await result;
        }
        issues.push(...fileIssues);
      }
      return issues;
    }
  }

  for (const ruleId of activeRuleIds) {
    const rule = BUILTIN_RULES[ruleId];
    if (!rule) continue;

    const fileIssues: Issue[] = [];

    // 使用通用函数获取规则配置
    const ruleCfg = getRuleConfig(ruleId, config);
    const configSeverity = ruleCfg?.severity;
    const ruleOptions = ruleCfg?.params;

    const context: AstRuleContext = {
      filePath: file.path,
      projectRoot,
      config,
      ruleOptions,
      report: (issueWithoutFile) => {
        const finalSeverity = configSeverity ?? issueWithoutFile.severity;
        fileIssues.push({
          file: file.path,
          ...issueWithoutFile,
          severity: finalSeverity,
        });
      },
    };

    const visitor = rule.create(context);

    traverseAst(ast, visitor, context, null);

    // 处理 exit 钩子（如 Program:exit）
    const exitHandler = (visitor as Record<string, unknown>)['Program:exit'];
    if (exitHandler && typeof exitHandler === 'function') {
      // 如果 exitHandler 是异步的，需要 await
      const result = (exitHandler as (node: ParsedAST) => void | Promise<void>)(ast);
      if (result instanceof Promise) {
        await result;
      }
    }

    for (const issue of fileIssues) {
      // 检查是否被忽略
      const ignoredRules = ignoreMap.get(issue.line);
      if (ignoredRules && ignoredRules.has(issue.ruleId)) {
        continue; // 跳过被忽略的问题
      }

      // 增量分析：只报告变更行的问题
      if (incremental && file.changedLines && file.changedLines.length > 0) {
        if (!file.changedLines.includes(issue.line)) {
          continue; // 跳过非变更行的问题
        }
      }
      issues.push(issue);
    }
  }

  return issues;
}

/**
 * 对指定文件集合运行 AST 规则分析
 *
 * 该函数是 AST 分析的核心入口，负责：
 * 1. 获取所有启用的规则
 * 2. 过滤出支持的文件类型
 * 3. 使用并发控制逐个分析文件
 * 4. 汇总所有发现的问题
 *
 * @param projectRoot - 项目根目录的绝对路径
 * @param config - AST Lint 配置对象
 * @param files - 待分析的文件列表
 * @param options - 运行时选项（如是否使用缓存）
 * @returns 所有文件中发现的问题列表
 *
 * @example
 * ```ts
 * import { runAstAnalysis } from './runner.js';
 * import { loadConfig } from '../../config/loader.js';
 * import { collectChangedFilesFromDiff } from '../git/collect.js';
 *
 * const { config } = await loadConfig('/path/to/project');
 * const { files } = collectChangedFilesFromDiff(gitDiffOutput);
 * const issues = await runAstAnalysis('/path/to/project', config, files);
 *
 * for (const issue of issues) {
 *   console.log(`${issue.file}:${issue.line}: ${issue.message}`);
 * }
 * ```
 */
export async function runAstAnalysis(
  projectRoot: string,
  config: AstLintConfig,
  files: ChangedFile[],
  options?: AstRunOptions,
): Promise<Issue[]> {
  // 获取所有启用的规则 ID
  const activeRuleIds = getActiveRuleIds(config);

  if (activeRuleIds.length === 0) {
    return [];
  }

  // 过滤支持的文件类型
  const supportedFiles = files.filter((file) =>
    /\.(js|jsx|ts|tsx|vue|css|scss|sass|less)$/.test(file.path),
  );

  if (supportedFiles.length === 0) {
    return [];
  }

  // 获取并发数配置
  const concurrency = config.defaults?.concurrency ?? DEFAULT_CONCURRENCY;

  // 初始化缓存（如果启用）
  const cacheEnabled = options?.useCache !== false && (config.cache?.enabled ?? true);
  let cache: AstCache | undefined;

  if (cacheEnabled) {
    cache = new AstCache(projectRoot, {
      enabled: true,
      maxAge: config.cache?.maxAge,
      cacheDir: config.cache?.location,
    });
    await cache.load();
  }

  // 使用并发控制处理所有文件
  const allIssues = await limitConcurrency(
    supportedFiles,
    concurrency,
    (file) => processFile(file, projectRoot, config, activeRuleIds, cache, options?.incremental),
  );

  // 保存缓存
  if (cache) {
    await cache.save();
  }

  // 扁平化结果
  return allIssues.flat();
}
