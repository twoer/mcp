import type { BaseASTNode } from './ast-types.js';

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueCategory = 'security' | 'maintainability' | 'performance' | 'vue' | 'react' | 'accessibility' | 'typescript' | 'general';

/**
 * 修复建议类型
 */
export type FixType = 'safe' | 'suggested' | 'guided' | 'manual';

/**
 * 修复步骤
 */
export interface FixStep {
  step: number;
  action: string;
  detail?: string;
  code?: string;
  command?: string;
}

/**
 * 自动修复信息
 */
export interface AutoFix {
  before: string;
  after: string;
  description?: string;
}

/**
 * 修复建议
 */
export interface FixSuggestion {
  title: string;
  description: string;
  fixType: FixType;
  autoFix?: AutoFix;
  steps?: FixStep[];
  codeExample?: {
    before: string;
    after: string;
  };
  references?: Array<{
    title: string;
    url: string;
  }>;
}

export interface Issue {
  file: string;
  line: number;
  endLine?: number;
  severity: IssueSeverity;
  category?: IssueCategory;
  ruleId: string;
  message: string;
  suggestion?: string;
  /** 修复建议（新增） */
  fixSuggestion?: FixSuggestion;
}

export interface RuleContextBase {
  filePath: string;
  report(issue: Omit<Issue, 'file'>): void;
}

/**
 * 规则访问器类型
 * 使用泛型支持更精确的节点类型
 */
export type RuleVisitor = {
  [nodeType: string]: (node: BaseASTNode, context: RuleContextBase) => void;
};

export interface RuleDefinition<C extends RuleContextBase = RuleContextBase> {
  id: string;
  create(context: C): RuleVisitor;
}

// AstRuleContext 需要 AstLintConfig，这里只定义基础接口
// 完整定义在 runner.ts 中
export interface AstRuleContextBase extends RuleContextBase {
  ruleOptions?: Record<string, unknown>;
  projectRoot?: string; // 项目根目录，用于规则读取文件
}
