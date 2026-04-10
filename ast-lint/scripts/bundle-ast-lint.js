#!/usr/bin/env node

/**
 * 将 AST Lint 核心代码复制到 MCP Server 项目中，并修复导入路径
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AST_LINT_ROOT = process.env.AST_LINT_ROOT || path.resolve(__dirname, '../../ast-lint');
const MCP_ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(MCP_ROOT, 'src/ast-lint-core');

// 需要复制的完整模块
const MODULES_TO_COPY = [
  { src: 'src/analysis/ast', dest: 'ast' },
  { src: 'src/config/types.ts', dest: 'config/types.ts' },
  { src: 'src/cache/ast-cache.ts', dest: 'cache/ast-cache.ts' },
  { src: 'src/git/collect.ts', dest: 'git/collect.ts' },
  { src: 'src/git/diff.ts', dest: 'git/diff.ts' },
  { src: 'src/utils/logger.ts', dest: 'utils/logger.ts' },
];

async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function fixImportPaths(filePath) {
  let content = await fs.readFile(filePath, 'utf-8');

  // 修复导入路径
  const replacements = [
    // config/types.ts
    [/from ['"]\.\.\/\.\.\/config\/types\.js['"]/g, "from '../config/types.js'"],
    [/from ['"]\.\.\/\.\.\/\.\.\/config\/types\.js['"]/g, "from '../../config/types.js'"],

    // git/collect.ts
    [/from ['"]\.\.\/\.\.\/git\/collect\.js['"]/g, "from '../git/collect.js'"],

    // cache/ast-cache.ts
    [/from ['"]\.\.\/\.\.\/cache\/ast-cache\.js['"]/g, "from '../cache/ast-cache.js'"],

    // analysis/ast/parser.ts
    [/from ['"]\.\.\/analysis\/ast\/parser\.js['"]/g, "from './ast/parser.js'"],

    // utils/logger.ts
    [/from ['"]\.\.\/utils\/logger\.js['"]/g, "from '../utils/logger.js'"],
  ];

  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }

  await fs.writeFile(filePath, content);
}

async function fixAllImports(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await fixAllImports(fullPath);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      await fixImportPaths(fullPath);
    }
  }
}

async function main() {
  console.log('🚀 开始打包 AST Lint 核心代码...\n');

  // 清理目标目录
  try {
    await fs.rm(TARGET_DIR, { recursive: true, force: true });
  } catch (err) {
    // 目录不存在，忽略
  }

  // 复制模块
  for (const module of MODULES_TO_COPY) {
    const srcPath = path.join(AST_LINT_ROOT, module.src);
    const destPath = path.join(TARGET_DIR, module.dest);
    const isFile = module.src.endsWith('.ts');

    if (isFile) {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      console.log(`✅ 复制文件: ${module.src}`);
    } else {
      await copyDirectory(srcPath, destPath);
      console.log(`✅ 复制目录: ${module.src}`);
    }
  }

  console.log('\n🔧 修复导入路径...');
  await fixAllImports(TARGET_DIR);
  console.log('✅ 导入路径已修复');

  console.log('\n✨ 打包完成！');
  console.log(`📦 核心代码已复制到: ${TARGET_DIR}`);
  console.log('\n下一步：npm run build');
}

main().catch((err) => {
  console.error('❌ 打包失败:', err);
  process.exit(1);
});
