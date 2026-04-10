#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

// 导入 AST Lint 核心模块（独立版本）
import { runAstAnalysis } from './ast-lint-core/ast/runner.js';
import { BUILTIN_RULES } from './ast-lint-core/ast/rule-registry.js';
import { parseCode } from './ast-lint-core/ast/parser.js';
import { traverseAst } from './ast-lint-core/ast/ast-traverser.js';
import { getActiveRuleIds, getRuleConfig } from './ast-lint-core/ast/rule-config.js';
import { collectFilesFromPath } from './ast-lint-core/git/collect.js';
import { getGitDiff } from './ast-lint-core/git/diff.js';
import { collectChangedFilesFromDiff } from './ast-lint-core/git/collect.js';
import { loadConfigFile, mergeConfig } from './ast-lint-core/config/loader.js';
import type { AstLintConfig } from './ast-lint-core/config/types.js';
import type { Issue } from './ast-lint-core/ast/types.js';
import type { AstRuleContext } from './ast-lint-core/ast/rule-registry.js';

// 工具 Schema 定义
const AnalyzeCodeSchema = z.object({
  code: z.string().describe('要分析的代码内容'),
  filePath: z.string().describe('文件路径（用于确定语言类型）'),
  categories: z
    .array(z.enum(['security', 'maintainability', 'performance', 'accessibility', 'vue']))
    .optional()
    .describe('过滤的问题类别'),
  severity: z
    .enum(['error', 'warning', 'info'])
    .optional()
    .describe('过滤的严重程度'),
});

const AnalyzeFileSchema = z.object({
  filePath: z.string().describe('要分析的文件路径'),
  categories: z
    .array(z.enum(['security', 'maintainability', 'performance', 'accessibility', 'vue']))
    .optional()
    .describe('过滤的问题类别'),
  severity: z
    .enum(['error', 'warning', 'info'])
    .optional()
    .describe('过滤的严重程度'),
});

const ListRulesSchema = z.object({
  category: z
    .enum(['security', 'maintainability', 'performance', 'accessibility', 'vue'])
    .optional()
    .describe('过滤的规则类别'),
});

const AnalyzeDirectorySchema = z.object({
  path: z.string().describe('目录路径'),
  pattern: z.string().optional().describe('glob 模式，如 **/*.vue'),
  categories: z
    .array(z.enum(['security', 'maintainability', 'performance', 'accessibility', 'vue']))
    .optional()
    .describe('过滤的问题类别'),
  format: z
    .enum(['summary', 'detailed'])
    .optional()
    .default('summary')
    .describe('输出格式'),
  maxFiles: z.number().optional().default(100).describe('最大文件数'),
});

const AnalyzeGitDiffSchema = z.object({
  base: z.string().optional().default('master').describe('基准分支或 commit'),
  categories: z
    .array(z.enum(['security', 'maintainability', 'performance', 'accessibility', 'vue']))
    .optional()
    .describe('过滤的问题类别'),
  onlyChanged: z.boolean().optional().default(true).describe('只分析变更行'),
  format: z
    .enum(['summary', 'detailed'])
    .optional()
    .default('summary')
    .describe('输出格式：summary（汇总）或 detailed（详细）'),
});

const GetFixSuggestionSchema = z.object({
  filePath: z.string().describe('文件路径'),
  line: z.number().describe('问题所在行号'),
  ruleId: z.string().optional().describe('规则 ID（可选，用于精确匹配）'),
});

const IgnoreIssueSchema = z.object({
  filePath: z.string().describe('文件路径'),
  line: z.number().describe('问题所在行号'),
  ruleId: z.string().describe('规则 ID'),
  reason: z.string().optional().describe('忽略原因（可选）'),
});

const UndoFixSchema = z.object({
  filePath: z.string().describe('文件路径'),
  backupId: z.string().describe('备份 ID（由 apply_fix 返回）'),
});

const ApplySafeFixesSchema = z.object({
  filePath: z.string().describe('文件路径'),
  ruleId: z.string().optional().describe('只应用特定规则的修复（可选）'),
});

const GetRuleStatsSchema = z.object({
  path: z.string().describe('目录路径'),
  groupBy: z.enum(['rule', 'file', 'severity', 'category']).optional().default('rule').describe('分组方式'),
});

const GenerateReportSchema = z.object({
  path: z.string().describe('目录路径'),
  outputPath: z.string().optional().describe('输出文件路径（可选，默认输出到 .ast-lint/reports/）'),
});

/**
 * 生成 unified diff 格式的对比
 */
function generateDiff(before: string, after: string, lineNumber: number): string {
  const lines: string[] = [];

  // Unified diff header
  lines.push(`@@ -${lineNumber},1 +${lineNumber},1 @@`);

  // 删除行（红色）
  lines.push(`-${before}`);

  // 添加行（绿色）
  lines.push(`+${after}`);

  return lines.join('\n');
}

// 创建最小化配置
function createMinimalConfig(): AstLintConfig {
  const defaultConfig: AstLintConfig = {
    version: '0.6.0',
    ai: {
      enabled: false,
      activeModel: '',
      timeout: 30,
      fallbackToAST: true,
      maxRetries: 0,
    },
    models: {},
    reporting: {
      autoSave: false,
      saveDir: '.ast-lint/reports',
      defaultFormat: 'text',
      verbose: false,
      showProgress: false,
    },
    defaults: {
      checkMode: 'staged',
      failOnWarnings: false,
      ignorePatterns: [],
    },
    rules: {
      framework: {
        vue: {
          enabled: true,
          rules: {},
        },
      },
      concern: {
        security: {
          enabled: true,
          rules: {},
        },
        maintainability: {
          enabled: true,
          rules: {},
        },
        performance: {
          enabled: true,
          rules: {},
        },
        accessibility: {
          enabled: true,
          rules: {},
        },
      },
    },
    cache: {
      enabled: true,
      maxAge: 604800000, // 7 days
    },
  };

  // 尝试加载用户配置文件
  const userConfig = loadConfigFile();

  // 合并配置
  return mergeConfig(defaultConfig, userConfig);
}

// 分析代码字符串（不需要文件存在）
async function analyzeCodeString(
  code: string,
  filePath: string,
  config: AstLintConfig
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // 确定文件类型
  const isVueFile = filePath.endsWith('.vue');
  const fileType = filePath.endsWith('.css') ? 'css' :
                   filePath.endsWith('.scss') ? 'scss' :
                   filePath.endsWith('.sass') ? 'sass' :
                   filePath.endsWith('.less') ? 'less' : 'ts';

  // 解析 AST
  let ast;
  try {
    ast = parseCode(code, isVueFile, fileType);
  } catch (err) {
    console.error('[AST Lint MCP] AST 解析失败:', (err as Error).message);
    throw new Error(`AST 解析失败: ${(err as Error).message}`);
  }

  // 获取启用的规则
  const activeRuleIds = getActiveRuleIds(config);

  // 运行每个规则
  for (const ruleId of activeRuleIds) {
    const rule = BUILTIN_RULES[ruleId];
    if (!rule) continue;

    const fileIssues: Issue[] = [];
    const ruleCfg = getRuleConfig(ruleId, config);
    const configSeverity = ruleCfg?.severity;
    const ruleOptions = ruleCfg?.params;

    const context: AstRuleContext = {
      filePath,
      config,
      ruleOptions,
      report: (issueWithoutFile) => {
        const finalSeverity = configSeverity ?? issueWithoutFile.severity;
        fileIssues.push({
          file: filePath,
          ...issueWithoutFile,
          severity: finalSeverity,
        });
      },
    };

    const visitor = rule.create(context);
    traverseAst(ast, visitor, context, null);

    // 处理 Program:exit 钩子
    const exitHandler = (visitor as Record<string, unknown>)['Program:exit'];
    if (exitHandler && typeof exitHandler === 'function') {
      const result = (exitHandler as (node: any) => void | Promise<void>)(ast);
      if (result instanceof Promise) {
        await result;
      }
    }

    issues.push(...fileIssues);
  }

  return issues;
}

// 创建 MCP Server
const server = new Server(
  {
    name: 'ast-lint',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具定义
const tools: Tool[] = [
  {
    name: 'analyze_code',
    description:
      '分析代码片段的质量问题。使用 AST Lint 的 34 条规则检测安全、可维护性、性能、可访问性和 Vue 特定问题。',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要分析的代码内容',
        },
        filePath: {
          type: 'string',
          description: '文件路径（用于确定语言类型，如 .ts, .vue）',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['security', 'maintainability', 'performance', 'accessibility', 'vue'],
          },
          description: '过滤的问题类别（可选）',
        },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'info'],
          description: '过滤的严重程度（可选）',
        },
      },
      required: ['code', 'filePath'],
    },
  },
  {
    name: 'analyze_file',
    description: '分析指定文件的代码质量问题。读取文件内容并使用 AST Lint 规则进行分析。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '要分析的文件路径（绝对路径或相对路径）',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['security', 'maintainability', 'performance', 'accessibility', 'vue'],
          },
          description: '过滤的问题类别（可选）',
        },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'info'],
          description: '过滤的严重程度（可选）',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'list_rules',
    description: '列出所有可用的 AST Lint 规则。可以按类别过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['security', 'maintainability', 'performance', 'accessibility', 'vue'],
          description: '过滤的规则类别（可选）',
        },
      },
    },
  },
  {
    name: 'analyze_directory',
    description: '批量分析目录下的所有文件。支持 glob 模式过滤文件。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录路径（绝对路径或相对路径）',
        },
        pattern: {
          type: 'string',
          description: 'glob 模式，如 **/*.vue（可选）',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['security', 'maintainability', 'performance', 'accessibility', 'vue'],
          },
          description: '过滤的问题类别（可选）',
        },
        format: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: '输出格式（可选，默认 summary）',
        },
        maxFiles: {
          type: 'number',
          description: '最大文件数（可选，默认 100）',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'analyze_git_diff',
    description: '分析 git diff 中的变更文件。可以只分析变更行。支持 summary 格式减少响应大小。',
    inputSchema: {
      type: 'object',
      properties: {
        base: {
          type: 'string',
          description: '基准分支或 commit（可选，默认 master）',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['security', 'maintainability', 'performance', 'accessibility', 'vue'],
          },
          description: '过滤的问题类别（可选）',
        },
        onlyChanged: {
          type: 'boolean',
          description: '只分析变更行（可选，默认 true）',
        },
        format: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: '输出格式（可选，默认 summary）：summary 只返回统计，detailed 返回所有问题详情',
        },
      },
    },
  },
  {
    name: 'get_fix_suggestion',
    description: '获取问题的修复建议。支持 4 级修复建议：Safe Fix（自动修复）、Suggested Fix（提供代码）、Guided Fix（步骤指导）、Manual Fix（重构建议）。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径（绝对路径或相对路径）',
        },
        line: {
          type: 'number',
          description: '问题所在行号',
        },
        ruleId: {
          type: 'string',
          description: '规则 ID（可选，如 maintainability/integer-pixel-units）',
        },
      },
      required: ['filePath', 'line'],
    },
  },
  {
    name: 'ignore_issue',
    description: '忽略指定的代码问题。在代码中添加忽略注释，使该问题在后续分析中被跳过。适用于合理的例外情况。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径（绝对路径或相对路径）',
        },
        line: {
          type: 'number',
          description: '问题所在行号',
        },
        ruleId: {
          type: 'string',
          description: '规则 ID（如 vue-no-timer-without-cleanup）',
        },
        reason: {
          type: 'string',
          description: '忽略原因（可选，如"全局组件不卸载"）',
        },
      },
      required: ['filePath', 'line', 'ruleId'],
    },
  },
  {
    name: 'undo_fix',
    description: '撤销之前的代码修复。从备份恢复文件到修复前的状态。需要提供 apply_safe_fixes 返回的备份 ID。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径（绝对路径或相对路径）',
        },
        backupId: {
          type: 'string',
          description: '备份 ID（格式：YYYY-MM-DDTHH-MM-SS）',
        },
      },
      required: ['filePath', 'backupId'],
    },
  },
  {
    name: 'apply_safe_fixes',
    description: '自动应用 Safe Fix 类型的修复。会自动创建备份，修复失败可以通过 undo_fix 恢复。只修复 fixType 为 "safe" 的问题。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径（绝对路径或相对路径）',
        },
        ruleId: {
          type: 'string',
          description: '只应用特定规则的修复（可选，如 maintainability/integer-pixel-units）',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'get_rule_stats',
    description: '获取代码质量统计信息。分析目录下所有文件，统计问题分布、规则违反次数、文件质量排名等。帮助团队了解代码质量趋势。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录路径（绝对路径或相对路径）',
        },
        groupBy: {
          type: 'string',
          enum: ['rule', 'file', 'severity', 'category'],
          description: '分组方式（默认：rule）',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate_report',
    description: '生成代码质量分析报告（Markdown 格式）。报告包含问题统计、规则分布、文件排名等信息。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录路径（绝对路径或相对路径）',
        },
        outputPath: {
          type: 'string',
          description: '输出文件路径（可选，默认：.ast-lint/reports/report-TIMESTAMP.md）',
        },
      },
      required: ['path'],
    },
  },
];

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'analyze_code': {
        const parsed = AnalyzeCodeSchema.parse(args);
        const result = await analyzeCode(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'analyze_file': {
        const parsed = AnalyzeFileSchema.parse(args);
        const result = await analyzeFile(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'list_rules': {
        const parsed = ListRulesSchema.parse(args);
        const result = await listRules(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'analyze_directory': {
        const parsed = AnalyzeDirectorySchema.parse(args);
        const result = await analyzeDirectory(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'analyze_git_diff': {
        const parsed = AnalyzeGitDiffSchema.parse(args);
        const result = await analyzeGitDiff(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_fix_suggestion': {
        const parsed = GetFixSuggestionSchema.parse(args);
        const result = await getFixSuggestion(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'ignore_issue': {
        const parsed = IgnoreIssueSchema.parse(args);
        const result = await ignoreIssue(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'undo_fix': {
        const parsed = UndoFixSchema.parse(args);
        const result = await undoFix(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'apply_safe_fixes': {
        const parsed = ApplySafeFixesSchema.parse(args);
        const result = await applySafeFixes(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_rule_stats': {
        const parsed = GetRuleStatsSchema.parse(args);
        const result = await getRuleStats(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'generate_report': {
        const parsed = GenerateReportSchema.parse(args);
        const result = await generateReport(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Error:', errorMessage);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// 工具实现函数
async function analyzeCode(params: z.infer<typeof AnalyzeCodeSchema>) {
  try {
    console.error('[AST Lint MCP] Analyzing code:', {
      filePath: params.filePath,
      codeLength: params.code.length,
      categories: params.categories,
      severity: params.severity,
    });

    const config = createMinimalConfig();
    const issues = await analyzeCodeString(params.code, params.filePath, config);

    // 过滤结果
    let filtered = issues;
    if (params.categories) {
      filtered = filtered.filter((issue) =>
        params.categories!.includes(issue.category as any)
      );
    }
    if (params.severity) {
      filtered = filtered.filter((issue) => issue.severity === params.severity);
    }

    return {
      status: 'success',
      issues: filtered,
      total: filtered.length,
      summary: {
        error: filtered.filter((i) => i.severity === 'error').length,
        warning: filtered.filter((i) => i.severity === 'warning').length,
        info: filtered.filter((i) => i.severity === 'info').length,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Analysis error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
      issues: [],
    };
  }
}

async function analyzeFile(params: z.infer<typeof AnalyzeFileSchema>) {
  try {
    console.error('[AST Lint MCP] Analyzing file:', params.filePath);

    // 解析路径
    const absolutePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(process.cwd(), params.filePath);

    // 检查文件是否存在
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    // 使用 runAstAnalysis（复用完整流程）
    const config = createMinimalConfig();
    // 将文件所在目录作为 projectRoot，文件名作为 path
    const projectRoot = path.dirname(absolutePath);
    const fileName = path.basename(absolutePath);

    const file = {
      path: fileName,
      status: 'modified' as const,
      additions: 0,
      deletions: 0,
    };

    const issues = await runAstAnalysis(projectRoot, config, [file]);

    // 过滤结果
    let filtered = issues;
    if (params.categories) {
      filtered = filtered.filter((issue) =>
        params.categories!.includes(issue.category as any)
      );
    }
    if (params.severity) {
      filtered = filtered.filter((issue) => issue.severity === params.severity);
    }

    return {
      status: 'success',
      issues: filtered,
      total: filtered.length,
      summary: {
        error: filtered.filter((i) => i.severity === 'error').length,
        warning: filtered.filter((i) => i.severity === 'warning').length,
        info: filtered.filter((i) => i.severity === 'info').length,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] File analysis error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
      issues: [],
    };
  }
}

async function listRules(params: z.infer<typeof ListRulesSchema>) {
  try {
    const allRules = Object.values(BUILTIN_RULES).map((rule) => {
      const [category, name] = rule.id.split('/');
      return {
        id: rule.id,
        category,
        name,
      };
    });

    const filtered = params.category
      ? allRules.filter((rule) => rule.category === params.category)
      : allRules;

    // 按类别分组
    const grouped = filtered.reduce((acc, rule) => {
      if (!acc[rule.category]) {
        acc[rule.category] = [];
      }
      acc[rule.category].push(rule);
      return acc;
    }, {} as Record<string, typeof filtered>);

    return {
      status: 'success',
      rules: filtered,
      grouped,
      total: filtered.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] List rules error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
      rules: [],
    };
  }
}

async function analyzeDirectory(params: z.infer<typeof AnalyzeDirectorySchema>) {
  try {
    console.error('[AST Lint MCP] Analyzing directory:', params.path);

    const config = createMinimalConfig();
    const projectRoot = process.cwd();

    // 解析路径
    const targetPath = path.isAbsolute(params.path)
      ? path.relative(projectRoot, params.path)
      : params.path;

    // 收集文件（使用配置文件中的 ignorePatterns）
    const ignorePatterns = config.defaults.ignorePatterns || [];
    const { files } = collectFilesFromPath(projectRoot, targetPath, ignorePatterns);

    // 限制文件数量
    const filesToAnalyze = files.slice(0, params.maxFiles);

    console.error(`[AST Lint MCP] Found ${files.length} files, analyzing ${filesToAnalyze.length}`);

    // 并行分析所有文件
    const allIssues = await runAstAnalysis(projectRoot, config, filesToAnalyze);

    // 过滤结果
    let filtered = allIssues;
    if (params.categories) {
      filtered = filtered.filter((issue) =>
        params.categories!.includes(issue.category as any)
      );
    }

    if (params.format === 'summary') {
      return generateSummary(filtered, filesToAnalyze.length);
    }

    return {
      status: 'success',
      issues: filtered,
      total: filtered.length,
      filesAnalyzed: filesToAnalyze.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Directory analysis error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
      issues: [],
    };
  }
}

async function analyzeGitDiff(params: z.infer<typeof AnalyzeGitDiffSchema>) {
  try {
    console.error('[AST Lint MCP] Analyzing git diff:', params.base);

    const config = createMinimalConfig();
    const projectRoot = process.cwd();

    // 智能解析 base 参数
    let commitRange: string;

    // 如果 base 包含 ~、^ 或看起来像 commit hash，直接使用
    if (params.base.includes('~') || params.base.includes('^') || /^[0-9a-f]{7,40}$/i.test(params.base)) {
      commitRange = params.base;
    } else {
      // 否则假设是分支名，使用 base...HEAD 格式
      commitRange = `${params.base}...HEAD`;
    }

    // 获取 git diff
    const { rawDiff } = await getGitDiff('diff', projectRoot, commitRange);

    // 解析变更文件
    const { files } = collectChangedFilesFromDiff(rawDiff);

    console.error(`[AST Lint MCP] Found ${files.length} changed files`);

    if (files.length === 0) {
      return {
        status: 'success',
        message: 'No changed files found',
        issues: [],
        total: 0,
      };
    }

    // 分析文件
    const allIssues = await runAstAnalysis(projectRoot, config, files);

    // 如果只分析变更行，过滤问题
    let filtered = allIssues;
    if (params.onlyChanged) {
      filtered = filtered.filter((issue) => {
        const file = files.find((f) => f.path === issue.file);
        if (!file || !file.changedLines) return true;
        return file.changedLines.includes(issue.line);
      });
    }

    // 按类别过滤
    if (params.categories) {
      filtered = filtered.filter((issue) =>
        params.categories!.includes(issue.category as any)
      );
    }

    // 根据 format 参数返回不同格式
    if (params.format === 'summary') {
      // 统计信息
      const ruleCount: Record<string, number> = {};
      const fileCount: Record<string, number> = {};

      filtered.forEach((issue) => {
        ruleCount[issue.ruleId] = (ruleCount[issue.ruleId] || 0) + 1;
        fileCount[issue.file] = (fileCount[issue.file] || 0) + 1;
      });

      const topRules = Object.entries(ruleCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([rule, count]) => ({ rule, count }));

      const topFiles = Object.entries(fileCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([file, count]) => ({ file, count }));

      return {
        status: 'success',
        total: filtered.length,
        filesAnalyzed: files.length,
        summary: {
          error: filtered.filter((i) => i.severity === 'error').length,
          warning: filtered.filter((i) => i.severity === 'warning').length,
          info: filtered.filter((i) => i.severity === 'info').length,
        },
        topRules,
        topFiles,
      };
    }

    // detailed 格式：返回所有问题详情
    return {
      status: 'success',
      issues: filtered,
      total: filtered.length,
      filesAnalyzed: files.length,
      summary: {
        error: filtered.filter((i) => i.severity === 'error').length,
        warning: filtered.filter((i) => i.severity === 'warning').length,
        info: filtered.filter((i) => i.severity === 'info').length,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Git diff analysis error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
      issues: [],
    };
  }
}

async function getFixSuggestion(params: z.infer<typeof GetFixSuggestionSchema>) {
  try {
    console.error('[AST Lint MCP] Getting fix suggestion for:', params.filePath, 'line:', params.line);

    // 解析路径
    const absolutePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(process.cwd(), params.filePath);

    // 检查文件是否存在
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    // 分析文件获取问题
    const config = createMinimalConfig();
    const projectRoot = path.dirname(absolutePath);
    const fileName = path.basename(absolutePath);

    const file = {
      path: fileName,
      status: 'modified' as const,
      additions: 0,
      deletions: 0,
    };

    const issues = await runAstAnalysis(projectRoot, config, [file]);

    // 查找指定行的问题
    let targetIssue = issues.find((issue) => issue.line === params.line);

    // 如果指定了 ruleId，精确匹配
    if (params.ruleId && targetIssue) {
      targetIssue = issues.find((issue) => issue.line === params.line && issue.ruleId === params.ruleId);
    }

    if (!targetIssue) {
      return {
        status: 'error',
        message: `未在第 ${params.line} 行找到问题${params.ruleId ? ` (规则: ${params.ruleId})` : ''}`,
      };
    }

    // 如果问题有修复建议，直接返回
    if (targetIssue.fixSuggestion) {
      // 生成 diff 预览（如果有 autoFix）
      let diff: string | undefined;
      if (targetIssue.fixSuggestion.autoFix) {
        const { before, after } = targetIssue.fixSuggestion.autoFix;
        diff = generateDiff(before, after, targetIssue.line);
      }

      return {
        status: 'success',
        issue: {
          file: targetIssue.file,
          line: targetIssue.line,
          ruleId: targetIssue.ruleId,
          message: targetIssue.message,
        },
        fixSuggestion: targetIssue.fixSuggestion,
        diff,
      };
    }

    // 如果没有修复建议，返回默认的 manual fix
    return {
      status: 'success',
      issue: {
        file: targetIssue.file,
        line: targetIssue.line,
        ruleId: targetIssue.ruleId,
        message: targetIssue.message,
      },
      fixSuggestion: {
        title: '需要手动修复',
        description: targetIssue.suggestion || '该问题需要人工分析和修复。',
        fixType: 'manual' as const,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Get fix suggestion error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
    };
  }
}

async function ignoreIssue(params: z.infer<typeof IgnoreIssueSchema>) {
  try {
    console.error('[AST Lint MCP] Ignoring issue:', params.filePath, 'line:', params.line, 'rule:', params.ruleId);

    // 解析路径
    const absolutePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(process.cwd(), params.filePath);

    // 检查文件是否存在
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    // 读取文件内容
    const content = await fs.readFile(absolutePath, 'utf8');
    const lines = content.split('\n');

    // 检查行号是否有效
    if (params.line < 1 || params.line > lines.length) {
      throw new Error(`行号 ${params.line} 超出文件范围（文件共 ${lines.length} 行）`);
    }

    // 生成忽略注释
    const reasonPart = params.reason ? ` -- ${params.reason}` : '';
    const ignoreComment = `// ast-lint-disable-next-line ${params.ruleId}${reasonPart}`;

    // 在指定行前插入忽略注释
    const targetLineIndex = params.line - 1;
    const targetLine = lines[targetLineIndex];

    // 获取目标行的缩进
    const indentMatch = targetLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    // 插入注释（保持相同缩进）
    lines.splice(targetLineIndex, 0, indent + ignoreComment);

    // 写回文件
    await fs.writeFile(absolutePath, lines.join('\n'), 'utf8');

    console.error(`[AST Lint MCP] Added ignore comment at line ${params.line}`);

    return {
      status: 'success',
      message: `已在第 ${params.line} 行前添加忽略注释`,
      comment: ignoreComment,
      file: params.filePath,
      line: params.line,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Ignore issue error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
    };
  }
}

/**
 * 创建文件备份
 * @returns 备份 ID（时间戳格式）
 */
async function createBackup(filePath: string, content: string): Promise<string> {
  const backupDir = path.join(process.cwd(), '.ast-lint', 'backups');

  // 确保备份目录存在
  await fs.mkdir(backupDir, { recursive: true });

  // 生成备份 ID（时间戳）
  const now = new Date();
  const backupId = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS

  // 备份文件名：原文件名.备份ID
  const fileName = path.basename(filePath);
  const backupPath = path.join(backupDir, `${fileName}.${backupId}`);

  // 写入备份
  await fs.writeFile(backupPath, content, 'utf8');

  return backupId;
}

async function undoFix(params: z.infer<typeof UndoFixSchema>) {
  try {
    console.error('[AST Lint MCP] Undoing fix:', params.filePath, 'backupId:', params.backupId);

    // 解析路径
    const absolutePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(process.cwd(), params.filePath);

    // 检查文件是否存在
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    // 查找备份文件
    const backupDir = path.join(process.cwd(), '.ast-lint', 'backups');
    const fileName = path.basename(absolutePath);
    const backupPath = path.join(backupDir, `${fileName}.${params.backupId}`);

    // 检查备份是否存在
    try {
      await fs.access(backupPath);
    } catch {
      throw new Error(`备份不存在: ${params.backupId}。请检查备份 ID 是否正确。`);
    }

    // 读取备份内容
    const backupContent = await fs.readFile(backupPath, 'utf8');

    // 恢复文件
    await fs.writeFile(absolutePath, backupContent, 'utf8');

    console.error(`[AST Lint MCP] Restored file from backup ${params.backupId}`);

    return {
      status: 'success',
      message: `已从备份 ${params.backupId} 恢复文件`,
      file: params.filePath,
      backupId: params.backupId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Undo fix error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
    };
  }
}

async function applySafeFixes(params: z.infer<typeof ApplySafeFixesSchema>) {
  try {
    console.error('[AST Lint MCP] Applying safe fixes:', params.filePath);

    // 解析路径
    const absolutePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(process.cwd(), params.filePath);

    // 检查文件是否存在
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    // 读取文件内容
    const originalContent = await fs.readFile(absolutePath, 'utf8');

    // 创建备份
    const backupId = await createBackup(absolutePath, originalContent);

    // 分析文件获取问题
    const config = createMinimalConfig();
    const projectRoot = path.dirname(absolutePath);
    const fileName = path.basename(absolutePath);

    const file = {
      path: fileName,
      status: 'modified' as const,
      additions: 0,
      deletions: 0,
    };

    const issues = await runAstAnalysis(projectRoot, config, [file]);

    // 过滤出 Safe Fix 问题
    let fixableIssues = issues.filter(
      (issue) => issue.fixSuggestion?.fixType === 'safe'
    );

    // 如果指定了 ruleId，只修复该规则
    if (params.ruleId) {
      fixableIssues = fixableIssues.filter((issue) => issue.ruleId === params.ruleId);
    }

    if (fixableIssues.length === 0) {
      return {
        status: 'success',
        message: '没有可自动修复的问题',
        applied: 0,
        backupId,
      };
    }

    // 按行号倒序排序，避免修改后行号偏移
    fixableIssues.sort((a, b) => b.line - a.line);

    // 应用修复（简化版：只支持 Tailwind 类名替换）
    let content = originalContent;
    const lines = content.split('\n');
    let appliedCount = 0;

    for (const issue of fixableIssues) {
      if (!issue.fixSuggestion?.autoFix) continue;

      const lineIndex = issue.line - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) continue;

      const { before, after } = issue.fixSuggestion.autoFix;

      // 简单的字符串替换
      if (lines[lineIndex].includes(before)) {
        lines[lineIndex] = lines[lineIndex].replace(before, after);
        appliedCount++;
      }
    }

    // 写回文件
    await fs.writeFile(absolutePath, lines.join('\n'), 'utf8');

    console.error(`[AST Lint MCP] Applied ${appliedCount} safe fixes`);

    return {
      status: 'success',
      message: `成功应用 ${appliedCount} 个自动修复`,
      applied: appliedCount,
      backupId,
      backupPath: `.ast-lint/backups/${fileName}.${backupId}`,
      fixes: fixableIssues.slice(0, 10).map((issue) => ({
        line: issue.line,
        ruleId: issue.ruleId,
        before: issue.fixSuggestion?.autoFix?.before,
        after: issue.fixSuggestion?.autoFix?.after,
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Apply safe fixes error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
    };
  }
}

async function getRuleStats(params: z.infer<typeof GetRuleStatsSchema>) {
  try {
    console.error('[AST Lint MCP] Getting rule stats for:', params.path);

    // 解析路径
    const absolutePath = path.isAbsolute(params.path)
      ? params.path
      : path.join(process.cwd(), params.path);

    // 检查目录是否存在
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        throw new Error(`路径不是目录: ${params.path}`);
      }
    } catch {
      throw new Error(`目录不存在: ${params.path}`);
    }

    // 使用 analyze_directory 获取所有问题
    const analysisResult = await analyzeDirectory({
      path: absolutePath,
      format: 'detailed',
      maxFiles: 1000,
    });

    if (analysisResult.status !== 'success' || !(analysisResult as any).issues) {
      throw new Error('分析失败');
    }

    const issues: Issue[] = (analysisResult as any).issues;
    const totalIssues = issues.length;
    const filesAnalyzed = (analysisResult as any).filesAnalyzed || 0;

    // 根据 groupBy 参数统计
    const stats: Record<string, any> = {};

    switch (params.groupBy) {
      case 'rule': {
        // 按规则统计
        const ruleStats: Record<string, { count: number; severity: Record<string, number>; files: Set<string> }> = {};

        issues.forEach((issue: Issue) => {
          if (!ruleStats[issue.ruleId]) {
            ruleStats[issue.ruleId] = { count: 0, severity: {}, files: new Set() };
          }
          ruleStats[issue.ruleId].count++;
          ruleStats[issue.ruleId].severity[issue.severity] = (ruleStats[issue.ruleId].severity[issue.severity] || 0) + 1;
          ruleStats[issue.ruleId].files.add(issue.file);
        });

        // 转换为数组并排序
        stats.byRule = Object.entries(ruleStats)
          .map(([ruleId, data]) => ({
            ruleId,
            count: data.count,
            percentage: ((data.count / totalIssues) * 100).toFixed(1) + '%',
            severity: data.severity,
            affectedFiles: data.files.size,
          }))
          .sort((a, b) => b.count - a.count);
        break;
      }

      case 'file': {
        // 按文件统计
        const fileStats: Record<string, { count: number; severity: Record<string, number>; rules: Set<string> }> = {};

        issues.forEach((issue: Issue) => {
          if (!fileStats[issue.file]) {
            fileStats[issue.file] = { count: 0, severity: {}, rules: new Set() };
          }
          fileStats[issue.file].count++;
          fileStats[issue.file].severity[issue.severity] = (fileStats[issue.file].severity[issue.severity] || 0) + 1;
          fileStats[issue.file].rules.add(issue.ruleId);
        });

        // 转换为数组并排序
        stats.byFile = Object.entries(fileStats)
          .map(([file, data]) => ({
            file,
            count: data.count,
            percentage: ((data.count / totalIssues) * 100).toFixed(1) + '%',
            severity: data.severity,
            violatedRules: data.rules.size,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20); // 只返回前 20 个
        break;
      }

      case 'severity': {
        // 按严重度统计
        const severityStats: Record<string, number> = {};
        issues.forEach((issue: Issue) => {
          severityStats[issue.severity] = (severityStats[issue.severity] || 0) + 1;
        });

        stats.bySeverity = Object.entries(severityStats).map(([severity, count]) => ({
          severity,
          count,
          percentage: ((count / totalIssues) * 100).toFixed(1) + '%',
        }));
        break;
      }

      case 'category': {
        // 按类别统计
        const categoryStats: Record<string, number> = {};
        issues.forEach((issue: Issue) => {
          const category = issue.category || 'general';
          categoryStats[category] = (categoryStats[category] || 0) + 1;
        });

        stats.byCategory = Object.entries(categoryStats)
          .map(([category, count]) => ({
            category,
            count,
            percentage: ((count / totalIssues) * 100).toFixed(1) + '%',
          }))
          .sort((a, b) => b.count - a.count);
        break;
      }
    }

    return {
      status: 'success',
      path: params.path,
      groupBy: params.groupBy,
      totalIssues,
      filesAnalyzed,
      stats,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Get rule stats error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
    };
  }
}

async function generateReport(params: z.infer<typeof GenerateReportSchema>) {
  try {
    console.error('[AST Lint MCP] Generating report for:', params.path);

    // 解析路径
    const absolutePath = path.isAbsolute(params.path)
      ? params.path
      : path.join(process.cwd(), params.path);

    // 先分析目录获取所有问题
    const analysisResult = await analyzeDirectory({
      path: absolutePath,
      format: 'detailed',
      maxFiles: 1000,
    });

    if (analysisResult.status !== 'success' || !(analysisResult as any).issues) {
      throw new Error('分析失败');
    }

    const issues: Issue[] = (analysisResult as any).issues;
    const filesAnalyzed = (analysisResult as any).filesAnalyzed || 0;

    // 获取统计信息
    const stats = await getRuleStats({
      path: absolutePath,
      groupBy: 'rule',
    });

    if (stats.status !== 'success') {
      throw new Error(stats.message || '统计失败');
    }

    // 生成报告内容
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportContent = generateMarkdownReport(stats, issues, timestamp);
    const fileExtension = 'md';

    // 确定输出路径
    let outputPath: string;
    if (params.outputPath) {
      outputPath = path.isAbsolute(params.outputPath)
        ? params.outputPath
        : path.join(process.cwd(), params.outputPath);
    } else {
      const reportDir = path.join(process.cwd(), '.ast-lint', 'reports');
      await fs.mkdir(reportDir, { recursive: true });
      outputPath = path.join(reportDir, `report-${timestamp}.${fileExtension}`);
    }

    // 写入报告
    await fs.writeFile(outputPath, reportContent, 'utf8');

    console.error(`[AST Lint MCP] Report generated: ${outputPath}`);

    return {
      status: 'success',
      message: `报告已生成`,
      outputPath,
      format: 'markdown',
      totalIssues: stats.totalIssues,
      filesAnalyzed: stats.filesAnalyzed,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AST Lint MCP] Generate report error:', errorMessage);
    return {
      status: 'error',
      message: errorMessage,
    };
  }
}

function generateMarkdownReport(stats: any, issues: Issue[], timestamp: string): string {
  const lines: string[] = [];

  lines.push('# AST Lint 代码质量分析报告');
  lines.push('');
  lines.push(`**生成时间：** ${timestamp.replace('T', ' ')}`);
  lines.push(`**分析路径：** ${stats.path}`);
  lines.push(`**文件数量：** ${stats.filesAnalyzed}`);
  lines.push(`**问题总数：** ${stats.totalIssues}`);
  lines.push('');

  // 严重度分布
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  lines.push('**严重度分布：**');
  lines.push(`- 🔴 Error: ${errorCount} (${((errorCount / stats.totalIssues) * 100).toFixed(1)}%)`);
  lines.push(`- 🟡 Warning: ${warningCount} (${((warningCount / stats.totalIssues) * 100).toFixed(1)}%)`);
  lines.push(`- 🔵 Info: ${infoCount} (${((infoCount / stats.totalIssues) * 100).toFixed(1)}%)`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 按规则统计
  if (stats.stats.byRule) {
    lines.push('## 📊 问题分布（按规则）');
    lines.push('');
    lines.push('| 规则 | 数量 | 占比 | 严重度 | 影响文件 |');
    lines.push('|------|------|------|--------|---------|');

    for (const rule of stats.stats.byRule.slice(0, 20)) {
      const severityStr = Object.entries(rule.severity)
        .map(([sev, count]) => `${sev}:${count}`)
        .join(', ');
      lines.push(`| ${rule.ruleId} | ${rule.count} | ${rule.percentage} | ${severityStr} | ${rule.affectedFiles} |`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 问题文件排名
  const fileIssueCount: Record<string, Issue[]> = {};
  issues.forEach((issue) => {
    if (!fileIssueCount[issue.file]) {
      fileIssueCount[issue.file] = [];
    }
    fileIssueCount[issue.file].push(issue);
  });

  const topFiles = Object.entries(fileIssueCount)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  lines.push('## 📁 问题文件排名（Top 10）');
  lines.push('');
  lines.push('| 文件 | 问题数 | Error | Warning | Info |');
  lines.push('|------|--------|-------|---------|------|');

  for (const [file, fileIssues] of topFiles) {
    const errorCnt = fileIssues.filter(i => i.severity === 'error').length;
    const warningCnt = fileIssues.filter(i => i.severity === 'warning').length;
    const infoCnt = fileIssues.filter(i => i.severity === 'info').length;
    lines.push(`| ${file} | ${fileIssues.length} | ${errorCnt} | ${warningCnt} | ${infoCnt} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // 详细问题列表（按规则分组）
  lines.push('## 🔍 详细问题列表');
  lines.push('');

  const issuesByRule: Record<string, Issue[]> = {};
  issues.forEach((issue) => {
    if (!issuesByRule[issue.ruleId]) {
      issuesByRule[issue.ruleId] = [];
    }
    issuesByRule[issue.ruleId].push(issue);
  });

  // 按问题数量排序
  const sortedRules = Object.entries(issuesByRule)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5); // 只显示 Top 5 规则的详细信息

  for (const [ruleId, ruleIssues] of sortedRules) {
    const [category, ruleName] = ruleId.split('/');
    lines.push(`### ${ruleId} (${ruleIssues.length} 个问题)`);
    lines.push('');

    // 获取第一个问题的修复建议
    const firstIssue = ruleIssues[0];
    if (firstIssue.suggestion) {
      lines.push(`**修复建议：** ${firstIssue.suggestion}`);
      lines.push('');
    }

    // 显示前 10 个问题
    lines.push('**问题位置：**');
    lines.push('');
    for (const issue of ruleIssues.slice(0, 10)) {
      const severityIcon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      // 生成相对路径链接（从报告目录 .ast-lint/reports/ 到源文件）
      const relativePath = `../../${issue.file}`;
      const fileLink = `[${issue.file}:${issue.line}](${relativePath}#L${issue.line})`;
      lines.push(`- ${severityIcon} ${fileLink} - ${issue.message}`);
    }

    if (ruleIssues.length > 10) {
      lines.push(`- ... 还有 ${ruleIssues.length - 10} 个问题`);
    }

    lines.push('');

    // 如果有修复建议，显示代码示例
    if (firstIssue.fixSuggestion?.codeExample) {
      lines.push('**代码示例：**');
      lines.push('');
      lines.push('```typescript');
      lines.push('// 修复前');
      lines.push(firstIssue.fixSuggestion.codeExample.before);
      lines.push('');
      lines.push('// 修复后');
      lines.push(firstIssue.fixSuggestion.codeExample.after);
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  lines.push('## 📚 参考资源');
  lines.push('');
  lines.push('- [AST Lint 配置指南](../../CONFIG_GUIDE.md)');
  lines.push('- [AST Lint 规则文档](https://github.com/twoer/mcp/tree/main/ast-lint/RULES.md)');
  lines.push('- [AICR 仓库地址](https://github.com/twoer/mcp/tree/main/ast-lint)');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('**报告生成工具：** AST Lint MCP Server v1.0.0');

  return lines.join('\n');
}


function generateSummary(issues: Issue[], filesAnalyzed: number) {
  // 统计 top issues
  const issueCount: Record<string, number> = {};
  issues.forEach((issue) => {
    issueCount[issue.ruleId] = (issueCount[issue.ruleId] || 0) + 1;
  });

  const topIssues = Object.entries(issueCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({ rule, count }));

  // 统计 top files
  const fileIssueCount: Record<string, number> = {};
  issues.forEach((issue) => {
    fileIssueCount[issue.file] = (fileIssueCount[issue.file] || 0) + 1;
  });

  const topFiles = Object.entries(fileIssueCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, issues: count }));

  return {
    status: 'success',
    total: filesAnalyzed,
    analyzed: filesAnalyzed,
    summary: {
      error: issues.filter((i) => i.severity === 'error').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    },
    topIssues,
    topFiles,
  };
}

// 启动服务器
async function main() {
  console.error('[AST Lint MCP] Starting server...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AST Lint MCP] Server started successfully');
}

main().catch((error) => {
  console.error('[AST Lint MCP] Fatal error:', error);
  process.exit(1);
});
