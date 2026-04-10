import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export class GitNotRepositoryError extends Error {
  constructor(message = 'Not a git repository') {
    super(message);
    this.name = 'GitNotRepositoryError';
  }
}

export type DiffMode = 'diff' | 'staged' | 'all';

export interface GitDiffResult {
  rawDiff: string;
}

function getDiffArgs(mode: DiffMode): string[] {
  switch (mode) {
    case 'staged':
      return ['diff', '--cached', '--unified=3', '--no-color', '--relative'];
    case 'all':
      // 'all' 模式在 getGitDiff 中特殊处理
      return ['diff', '--unified=3', '--no-color', '--relative'];
    case 'diff':
    default:
      return ['diff', '--unified=3', '--no-color', '--relative'];
  }
}

export async function getGitDiff(mode: DiffMode, cwd: string, commitRange?: string): Promise<GitDiffResult> {
  // 如果指定了 commit 范围，优先使用 commit 范围
  if (commitRange) {
    return getGitDiffByCommits(commitRange, cwd);
  }
  
  const args = getDiffArgs(mode);

  try {
    let stdout: string;
    
    if (mode === 'all') {
      // 'all' 模式需要特殊处理：比较与第一次提交的差异
      // 先获取第一次提交的 hash
      const { stdout: firstCommit } = await execAsync('git rev-list --max-parents=0 HEAD', { 
        cwd,
        maxBuffer: 1024 * 1024,  // 1MB 足够获取 commit hash
      });
      const baseCommit = firstCommit.trim();
      
      // 使用 baseCommit 作为基线
      const result = await execFileAsync('git', ['diff', '--unified=3', '--no-color', '--relative', baseCommit], {
        cwd,
        shell: false,
        maxBuffer: 50 * 1024 * 1024,  // 50MB，全量比较需要更大的缓冲区
      });
      stdout = result.stdout;
    } else {
      const result = await execFileAsync('git', args, {
        cwd,
        shell: false,
        maxBuffer: 10 * 1024 * 1024,
      });
      stdout = result.stdout;
    }

    return {
      rawDiff: stdout,
    };
  } catch (err: unknown) {
    const stderr: string | undefined = err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string' ? err.stderr : undefined;
    if (stderr && stderr.includes('Not a git repository')) {
      throw new GitNotRepositoryError('当前目录不是 git 仓库，请在 git 仓库根目录运行 ast-lint。');
    }
    throw err;
  }
}

/**
 * 获取两个 commit 之间的 diff
 * @param commitRange commit 范围，例如 "abc123..def456" 或 "HEAD~3..HEAD"
 * @param cwd 工作目录
 */
export async function getGitDiffByCommits(commitRange: string, cwd: string): Promise<GitDiffResult> {
  // 验证 commit 范围格式，防止命令注入
  // 允许的字符: 十六进制 (a-fA-F0-9), HEAD/head, ~, ^, ., .., 字母（分支名）, -, /
  const validPattern = /^[a-zA-Z0-9._~^/\-]+$/;
  if (!validPattern.test(commitRange)) {
    throw new Error('无效的 commit 范围格式，包含非法字符');
  }

  try {

    const result = await execFileAsync('git', [
      'diff',
      '--unified=3',
      '--no-color',
      '--relative',
      commitRange
    ], {
      cwd,
      shell: false,
      maxBuffer: 50 * 1024 * 1024,  // 50MB
    });

    return {
      rawDiff: result.stdout,
    };
  } catch (err: unknown) {
    const stderr: string | undefined = err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string' ? err.stderr : undefined;
    if (stderr && stderr.includes('Not a git repository')) {
      throw new GitNotRepositoryError('当前目录不是 git 仓库，请在 git 仓库根目录运行 ast-lint。');
    }
    if (stderr && (stderr.includes('unknown revision') || stderr.includes('bad revision'))) {
      throw new Error(`无效的 commit 引用: ${commitRange}`);
    }
    throw err;
  }
}
