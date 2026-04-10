/**
 * 统一日志管理模块
 *
 * 提供可控的日志输出，支持通过环境变量控制日志级别。
 *
 * 环境变量:
 * - AST_LINT_DEBUG: 启用 debug 级别日志
 * - AST_LINT_VERBOSE: 启用 verbose 级别日志
 */

type LogLevel = 'debug' | 'verbose' | 'info' | 'warn' | 'error';

interface Logger {
  debug: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  log: (level: LogLevel, ...args: unknown[]) => void;
}

const LOG_PREFIX = '[ast-lint]';

/**
 * 格式化日志参数
 */
function formatArgs(...args: unknown[]): unknown[] {
  if (args.length === 0) return [];
  // 如果第一个参数是字符串，添加前缀
  if (typeof args[0] === 'string') {
    return [`${LOG_PREFIX} ${args[0]}`, ...args.slice(1)];
  }
  return [LOG_PREFIX, ...args];
}

/**
 * 检查日志级别是否启用
 */
function isLevelEnabled(level: LogLevel): boolean {
  const { AST_LINT_DEBUG, AST_LINT_VERBOSE } = process.env;

  switch (level) {
    case 'debug':
      return AST_LINT_DEBUG === 'true' || AST_LINT_DEBUG === '1';
    case 'verbose':
      return AST_LINT_VERBOSE === 'true' || AST_LINT_VERBOSE === '1' || isLevelEnabled('debug');
    default:
      return true;
  }
}

/**
 * 统一日志管理器
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * logger.debug('调试信息'); // 仅当 AST_LINT_DEBUG=true 时输出
 * logger.verbose('详细日志'); // 仅当 AST_LINT_VERBOSE=true 或 AST_LINT_DEBUG=true 时输出
 * logger.info('普通信息');
 * logger.warn('警告信息');
 * logger.error('错误信息');
 * ```
 */
export const logger: Logger = {
  /**
   * 调试日志 - 仅在 AST_LINT_DEBUG=true 时输出
   */
  debug(...args: unknown[]): void {
    if (isLevelEnabled('debug')) {
      console.log(...formatArgs(...args));
    }
  },

  /**
   * 详细日志 - 在 AST_LINT_VERBOSE=true 或 AST_LINT_DEBUG=true 时输出
   */
  verbose(...args: unknown[]): void {
    if (isLevelEnabled('verbose')) {
      console.warn(...formatArgs(...args));
    }
  },

  /**
   * 普通信息日志
   */
  info(...args: unknown[]): void {
    console.log(...formatArgs(...args));
  },

  /**
   * 警告日志
   */
  warn(...args: unknown[]): void {
    console.warn(...formatArgs(...args));
  },

  /**
   * 错误日志
   */
  error(...args: unknown[]): void {
    console.error(...formatArgs(...args));
  },

  /**
   * 通用日志方法 - 按级别输出
   * @param level - 日志级别
   * @param args - 日志参数
   */
  log(level: LogLevel, ...args: unknown[]): void {
    switch (level) {
      case 'debug':
        this.debug(...args);
        break;
      case 'verbose':
        this.verbose(...args);
        break;
      case 'info':
        this.info(...args);
        break;
      case 'warn':
        this.warn(...args);
        break;
      case 'error':
        this.error(...args);
        break;
    }
  },
};

export type { Logger, LogLevel };
