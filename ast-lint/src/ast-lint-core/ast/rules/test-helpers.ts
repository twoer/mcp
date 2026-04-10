import type { AstRuleContext } from '../rule-registry.js';
import type { Issue, RuleDefinition } from '../types.js';
import type { AstLintConfig } from '../../config/types.js';
import type { BaseASTNode } from '../ast-types.js';
import { parse } from '@typescript-eslint/parser';

/** 用于测试的最小化默认配置 */
const DEFAULT_TEST_CONFIG: AstLintConfig = {
  version: '0.1.0',
  ai: { enabled: false, activeModel: '', timeout: 30, fallbackToAST: true, maxRetries: 0 },
  models: {},
  reporting: { autoSave: false, saveDir: '.ast-lint/reports', defaultFormat: 'text', verbose: false, showProgress: false },
  defaults: { checkMode: 'staged', failOnWarnings: false, ignorePatterns: [] },
  rules: {},
};

/**
 * Mock context for rule testing
 * 与 AstRuleContext 接口完全一致
 */
export function createMockContext(options?: {
  filePath?: string;
  config?: Partial<AstLintConfig>;
  ruleOptions?: Record<string, unknown>;
}): AstRuleContext & { issues: Issue[]; sourceCode: string } {
  const issues: Issue[] = [];
  const filePath = options?.filePath ?? 'test.ts';

  return {
    filePath,
    config: { ...DEFAULT_TEST_CONFIG, ...options?.config } as AstLintConfig,
    ruleOptions: options?.ruleOptions,
    sourceCode: '',
    report(issue: Omit<Issue, 'file'>) {
      issues.push({
        ...issue,
        file: filePath,
      });
    },
    issues,
  };
}

export type { Issue } from '../types.js';

/**
 * Parse TypeScript/JavaScript code to AST
 */
export function parseCode(code: string, language: 'typescript' | 'javascript' = 'typescript') {
  return parse(code, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    ecmaFeatures: {
      jsx: false,
    },
  });
}

/**
 * Vue AST 特有的需要遍历的属性名
 * 这些属性在 Vue ESLint Parser 生成的 AST 中包含子节点
 */
const VUE_SPECIAL_KEYS = [
  'startTag',      // VElement.startTag -> VStartTag
  'endTag',        // VElement.endTag -> VEndTag
  'attributes',    // VStartTag.attributes -> (VAttribute | VDirective)[]
  'children',      // VElement.children -> VNode[]
  'key',           // VDirective.key -> VDirectiveKey, VAttribute.key -> VIdentifier
  'value',         // VDirective.value -> VExpressionContainer, VAttribute.value -> VLiteral
  'name',          // VElement.name, VIdentifier.name, VDirectiveKey.name
  'argument',      // VDirectiveKey.argument -> VIdentifier | VExpressionContainer
  'modifiers',     // VDirectiveKey.modifiers -> VIdentifier[]
  'expression',    // VExpressionContainer.expression -> Expression
  'filters',       // VFilterSequenceExpression.filters -> VFilter[]
  'callee',        // VFilter.callee -> Identifier
  'rawName',       // VDirectiveKey.rawName
];

/**
 * Simple AST traversal function with circular reference protection.
 * Sets parent references on child nodes so rules can walk up the tree.
 * Supports both standard ESTree AST and Vue ESLint Parser AST nodes.
 */
function simpleTraverse(node: BaseASTNode, visitor: (node: BaseASTNode) => void): void {
  const visited = new WeakSet<object>();

  function traverse(node: BaseASTNode | null | undefined, parent: BaseASTNode | undefined): void {
    if (!node || typeof node !== 'object') return;

    // Prevent infinite loops with circular references
    if (visited.has(node)) return;
    visited.add(node);

    // Set parent reference (skip the root Program node's parent)
    if (parent !== undefined) {
      (node as BaseASTNode & { parent?: BaseASTNode }).parent = parent;
    }

    visitor(node);

    for (const key of Object.keys(node)) {
      // Skip parent to avoid circular traversal
      if (key === 'parent') continue;

      // Skip non-object/array values (string, number, boolean, etc.)
      // Exception: Vue AST 特殊属性即使值可能是对象也需要检查
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        value.forEach((item) => traverse(item as BaseASTNode, node));
      } else if (typeof value === 'object' && value !== null) {
        // 对于 Vue AST，某些属性可能是对象节点需要遍历
        // 检查是否是 AST 节点（有 type 属性）或 Vue 特殊属性
        if ((value as BaseASTNode).type || VUE_SPECIAL_KEYS.includes(key)) {
          traverse(value as BaseASTNode, node);
        }
      }
    }
  }

  traverse(node, undefined);
}

/**
 * Run a rule on code and return issues
 */
export function runRule(
  rule: RuleDefinition<AstRuleContext>,
  code: string,
  language: 'typescript' | 'javascript' | 'vue' = 'typescript',
): Issue[] {
  const context = createMockContext();
  const ast = parseCode(code, language as 'typescript' | 'javascript');

  context.sourceCode = code;

  // Create rule handlers
  const handlers = rule.create(context);

  // Simple AST traversal and apply handlers
  simpleTraverse(ast as BaseASTNode, (node) => {
    const handler = handlers[node.type];
    if (handler) {
      handler(node, context);
    }
  });

  return context.issues;
}

/**
 * Run a rule with specific visitor handlers
 */
export function runRuleWithVisitors(
  rule: RuleDefinition<AstRuleContext>,
  code: string,
  visitors: string[],
  language: 'typescript' | 'javascript' = 'typescript',
): Issue[] {
  const context = createMockContext();
  const ast = parseCode(code, language);

  context.sourceCode = code;

  // Create rule handlers
  const handlers = rule.create(context);

  // Run only specific visitor types
  visitors.forEach(visitorType => {
    const handler = handlers[visitorType];
    if (handler) {
      simpleTraverse(ast as BaseASTNode, (node) => {
        if (node.type === visitorType) {
          handler(node, context);
        }
      });
    }
  });

  return context.issues;
}

/**
 * Assert that an issue matches expected properties
 * Note: This function is only for use in test files
 */
export function assertIssue(issue: Issue, expected: Partial<Issue>): void {
  // This function should only be called from test files
  // The expect function is provided by vitest in test context
  if (typeof (globalThis as Record<string, unknown>).expect === 'undefined') {
    throw new Error('assertIssue can only be used in test files');
  }
  const expect = (globalThis as Record<string, unknown>).expect as (value: unknown) => {
    toBe: (expected: unknown) => void;
    toContain: (expected: unknown) => void;
  };

  expect(issue.ruleId).toBe(expected.ruleId);
  if (expected.category) expect(issue.category).toBe(expected.category);
  if (expected.severity) expect(issue.severity).toBe(expected.severity);
  if (expected.message) expect(issue.message).toContain(expected.message);
  if (expected.suggestion) expect(issue.suggestion).toContain(expected.suggestion);
  if (expected.line) expect(issue.line).toBe(expected.line);
}

/**
 * Parse Vue SFC to AST
 */
export function parseVueCode(code: string) {
  const { parse: parseVue } = require('vue-eslint-parser');
  return parseVue(code, {
    sourceType: 'module',
    ecmaVersion: 'latest',
  });
}

/**
 * Run a rule on Vue code
 */
export function runVueRule(rule: RuleDefinition<AstRuleContext>, code: string, ruleOptions?: Record<string, unknown>): Issue[] {
  const context = createMockContext();
  const ast = parseVueCode(code);

  context.sourceCode = code;
  if (ruleOptions) {
    context.ruleOptions = ruleOptions;
  }

  // Create rule handlers
  const handlers = rule.create(context);

  // Simple AST traversal and apply handlers
  simpleTraverse(ast as BaseASTNode, (node) => {
    const handler = handlers[node.type];
    if (handler) {
      handler(node, context);
    }
  });
  return context.issues;
}

/**
 * Run a rule on TypeScript/JavaScript code
 */
export function runTsRule(rule: RuleDefinition<AstRuleContext>, code: string): Issue[] {
  const context = createMockContext();
  const ast = parseCode(code);

  context.sourceCode = code;

  // Create rule handlers
  const handlers = rule.create(context);

  // Simple AST traversal and apply handlers
  simpleTraverse(ast as BaseASTNode, (node) => {
    const handler = handlers[node.type];
    if (handler) {
      handler(node, context);
    }
  });
  return context.issues;
}
