#!/usr/bin/env node

/**
 * AST Lint MCP Server 测试脚本
 *
 * 用法：
 *   npm run test:integration
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 测试用例
const testCases = [
  {
    name: '列出所有规则',
    request: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'list_rules',
        arguments: {},
      },
    },
  },
  {
    name: '列出安全类规则',
    request: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'list_rules',
        arguments: {
          category: 'security',
        },
      },
    },
  },
  {
    name: '分析包含硬编码密钥的代码',
    request: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'analyze_code',
        arguments: {
          code: 'const apiKey = "sk-1234567890abcdef";',
          filePath: 'test.ts',
          categories: ['security'],
        },
      },
    },
  },
  {
    name: '分析过长的函数',
    request: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'analyze_code',
        arguments: {
          code: `function longFunction() {
  ${Array(250).fill('console.log("line");').join('\n  ')}
}`,
          filePath: 'test.ts',
          categories: ['maintainability'],
        },
      },
    },
  },
];

async function runTest(testCase: any) {
  console.log(`\n🧪 测试: ${testCase.name}`);
  console.log('━'.repeat(60));

  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, '../dist/index.js');
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (stderr) {
        console.log('📋 服务器日志:');
        console.log(stderr);
      }

      if (stdout) {
        try {
          // 解析 JSON-RPC 响应
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              const response = JSON.parse(line);
              if (response.result) {
                console.log('✅ 响应:');
                console.log(JSON.stringify(response.result, null, 2));
              } else if (response.error) {
                console.log('❌ 错误:');
                console.log(JSON.stringify(response.error, null, 2));
              }
            }
          }
        } catch (err) {
          console.log('⚠️  原始输出:');
          console.log(stdout);
        }
      }

      resolve(code);
    });

    child.on('error', (err) => {
      console.error('❌ 进程错误:', err);
      reject(err);
    });

    // 发送请求
    child.stdin.write(JSON.stringify(testCase.request) + '\n');
    child.stdin.end();

    // 超时保护
    setTimeout(() => {
      child.kill();
      reject(new Error('测试超时'));
    }, 5000);
  });
}

async function main() {
  console.log('🚀 AST Lint MCP Server 集成测试');
  console.log('═'.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      await runTest(testCase);
      passed++;
    } catch (err) {
      console.error('❌ 测试失败:', err);
      failed++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
