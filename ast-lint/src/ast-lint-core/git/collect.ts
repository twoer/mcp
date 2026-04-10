import * as fs from 'node:fs';
import * as path from 'node:path';
import { minimatch } from 'minimatch';

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'unknown';
  /** 变更的行号列表（1-based），用于增量分析 */
  changedLines?: number[];
}

export interface CollectedChanges {
  files: ChangedFile[];
}

/**
 * 默认忽略的目录模式
 * 这些目录通常包含构建产物、依赖包或临时文件，不应被分析
 */
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.output',      // Nuxt 3 构建输出
  '.nuxt',        // Nuxt 2/3 临时文件
  '.next',        // Next.js 构建输出
  'out',          // Next.js 静态导出
  'coverage',     // 测试覆盖率报告
  '.cache',       // 缓存目录
  '.temp',
  '.tmp',
  'vendor',       // PHP/Go 依赖
  'target',       // Rust/Java 构建输出
  '__tests__',    // Jest 测试目录
  'tests',        // 通用测试目录
  'test',         // 通用测试目录
  '__mocks__',    // Jest mock 目录
]);

/**
 * 默认忽略的文件模式（glob 格式）
 * 这些文件通常是测试文件、配置文件或生成文件，不应被分析
 */
const DEFAULT_IGNORE_PATTERNS = [
  '**/*.test.ts',
  '**/*.test.js',
  '**/*.test.tsx',
  '**/*.test.jsx',
  '**/*.spec.ts',
  '**/*.spec.js',
  '**/*.spec.tsx',
  '**/*.spec.jsx',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.chunk.js',
];

/**
 * 收集指定路径下的所有代码文件
 *
 * 递归扫描目标路径，收集所有支持的代码文件。自动跳过：
 * - `node_modules` 目录
 * - `.git` 目录
 * - `dist` 和 `build` 目录
 * - `.output` / `.nuxt` / `.next` 等构建产物目录
 * - `coverage` 测试覆盖率目录
 *
 * 支持的文件扩展名：
 * - TypeScript/JavaScript: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`
 * - Vue: `.vue`
 * - 样式: `.css`, `.scss`, `.sass`, `.less`
 *
 * @param basePath - 项目根目录的绝对路径
 * @param targetPath - 要扫描的目标路径（相对于项目根目录或绝对路径）
 * @param ignorePatterns - 额外的忽略模式（glob 格式），可选
 * @returns 收集到的文件列表，所有文件状态标记为 'modified'
 * @throws 如果目标路径不存在
 *
 * @example
 * ```ts
 * import { collectFilesFromPath } from './collect.js';
 *
 * // 扫描整个 src 目录
 * const { files } = collectFilesFromPath('/project', 'src');
 *
 * // 扫描单个文件
 * const { files } = collectFilesFromPath('/project', 'src/index.ts');
 *
 * // 使用自定义忽略模式
 * const { files } = collectFilesFromPath('/project', 'src', ['star-star/*.test.ts']);
 * ```
 */
export function collectFilesFromPath(
  basePath: string,
  targetPath: string,
  ignorePatterns?: string[]
): CollectedChanges {
  const files: ChangedFile[] = [];
  const fullPath = path.resolve(basePath, targetPath);

  // 检查路径是否存在
  if (!fs.existsSync(fullPath)) {
    throw new Error(`路径不存在: ${targetPath}`);
  }

  /**
   * 检查文件是否应该被忽略
   */
  function shouldIgnoreFile(relativePath: string): boolean {
    // 合并用户提供的忽略模式和默认忽略模式
    const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...(ignorePatterns || [])];

    // 使用 minimatch 检查是否匹配任何忽略模式
    return allPatterns.some(pattern => {
      return minimatch(relativePath, pattern, { dot: true });
    });
  }

  // 递归收集文件
  function scanDir(dirPath: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      // 跳过默认忽略的目录
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) {
          continue;
        }
        scanDir(entryPath);
      } else if (entry.isFile()) {
        // 只收集代码文件
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.vue', '.mjs', '.cjs', '.css', '.scss', '.sass', '.less'].includes(ext)) {
          // 转换为相对于项目根目录的路径
          const relativePath = path.relative(basePath, entryPath).replace(/\\/g, '/');

          // 检查是否应该忽略
          if (!shouldIgnoreFile(relativePath)) {
            files.push({
              path: relativePath,
              status: 'modified', // 全量检查时标记为 modified
            });
          }
        }
      }
    }
  }

  // 如果是文件，直接添加
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

    // 检查是否应该忽略
    if (!shouldIgnoreFile(relativePath)) {
      files.push({
        path: relativePath,
        status: 'modified',
      });
    }
  } else {
    // 如果是目录，递归扫描
    scanDir(fullPath);
  }

  return { files };
}

/**
 * 从 Git diff 输出中解析变更的文件列表
 *
 * 解析 `git diff` 命令的输出，提取所有变更文件的路径和变更行号。
 * 支持解析 unified diff 格式的行号信息（@@ -a,b +c,d @@）。
 *
 * @param rawDiff - `git diff` 命令的原始输出
 * @returns 解析出的变更文件列表（包含变更行号）
 *
 * @example
 * ```ts
 * import { collectChangedFilesFromDiff } from './collect.js';
 *
 * const diffOutput = `diff --git a/src/index.ts b/src/index.ts
 * index 1234567..abcdefg 100644
 * --- a/src/index.ts
 * +++ b/src/index.ts
 * @@ -1,5 +1,6 @@
 *  line1
 * +newLine
 *  line2`;
 *
 * const { files } = collectChangedFilesFromDiff(diffOutput);
 * // files[0].path === 'src/index.ts'
 * // files[0].changedLines === [2]
 * ```
 */
export function collectChangedFilesFromDiff(rawDiff: string): CollectedChanges {
  const files: ChangedFile[] = [];
  const fileChangedLinesMap = new Map<string, number[]>();

  const lines = rawDiff.split(/\r?\n/);
  let currentFilePath: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 解析文件路径
    if (line.startsWith('diff --git')) {
      const parts = line.split(' ');
      const aPath = parts[2]; // a/xxx
      const bPath = parts[3]; // b/xxx

      const normalized = (bPath ?? aPath).replace(/^a\//, '').replace(/^b\//, '');
      currentFilePath = normalized;

      if (!files.some((f) => f.path === normalized)) {
        files.push({ path: normalized, status: 'modified' });
        fileChangedLinesMap.set(normalized, []);
      }
      continue;
    }

    // 解析 hunk header: @@ -a,b +c,d @@ 或 @@ -a +c @@
    // c 表示新文件中的起始行号，需要提取出来
    const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunkMatch && currentFilePath) {
      const startLine = parseInt(hunkMatch[1], 10);
      const changedLines = fileChangedLinesMap.get(currentFilePath);
      if (changedLines) {
        // 解析 hunk 内的变更行
        let currentNewLine = startLine;
        for (let j = i + 1; j < lines.length; j++) {
          const hunkLine = lines[j];
          // 遇到新的 hunk 或新的文件，停止当前 hunk 解析
          if (hunkLine.startsWith('@@') || hunkLine.startsWith('diff --git')) {
            break;
          }
          // 新增行（+ 开头）
          if (hunkLine.startsWith('+') && !hunkLine.startsWith('+++')) {
            if (!changedLines.includes(currentNewLine)) {
              changedLines.push(currentNewLine);
            }
            currentNewLine++;
          }
          // 删除行（- 开头），不计入新行号
          else if (hunkLine.startsWith('-') && !hunkLine.startsWith('---')) {
            // 删除的行不影响新文件的行号
          }
          // 上下文行（空格开头或空行）
          else if (hunkLine.startsWith(' ') || hunkLine === '') {
            currentNewLine++;
          }
          // 结束 hunk（遇到非 diff 行格式）
          else if (!hunkLine.startsWith('\\')) {
            // \ No newline at end of file 等特殊情况
            continue;
          }
        }
      }
    }
  }

  // 将变更行号附加到文件信息
  for (const file of files) {
    const changedLines = fileChangedLinesMap.get(file.path);
    if (changedLines && changedLines.length > 0) {
      file.changedLines = changedLines.sort((a, b) => a - b);
    }
  }

  return { files };
}
