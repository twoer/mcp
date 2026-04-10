import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, FunctionNode } from '../../ast-types.js';

/**
 * 检测代码嵌套层级过深的情况
 * 嵌套过深会导致代码难以理解和维护
 */
export const deepNestingRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/deep-nesting',
  create(context: AstRuleContext) {
    const maxDepth = (context.ruleOptions?.maxDepth as number | undefined) ?? 4;

    // 增加嵌套深度的节点类型
    const nestingNodes = [
      'IfStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'SwitchStatement',
      'TryStatement',
      'ConditionalExpression',
      'LogicalExpression', // && 或 ||
    ];

    /**
     * 从节点向下遍历计算最大嵌套深度
     */
    function calculateMaxDepth(node: BaseASTNode | null | undefined, currentDepth: number): number {
      if (!node || typeof node !== 'object') return currentDepth;

      let maxDepthFound = currentDepth;

      // 检查是否是增加嵌套的节点
      const isNestingNode = nestingNodes.includes(node.type);
      const nextDepth = isNestingNode ? currentDepth + 1 : currentDepth;

      // 递归遍历子节点
      for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'loc' || key === 'type') continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object') {
                maxDepthFound = Math.max(maxDepthFound, calculateMaxDepth(item as BaseASTNode, nextDepth));
              }
            }
          } else {
            maxDepthFound = Math.max(maxDepthFound, calculateMaxDepth(child as BaseASTNode, nextDepth));
          }
        }
      }

      return maxDepthFound;
    }

    /**
     * 检查函数体的嵌套深度
     */
    function checkFunction(node: BaseASTNode): void {
      const funcNode = node as FunctionNode;
      const body = funcNode.body;
      if (!body) return;

      // 从函数体开始向下遍历，计算最大嵌套深度
      // 函数体本身不计入深度，从 0 开始
      const maxNestingDepth = calculateMaxDepth(body, 0);

      if (maxNestingDepth > maxDepth) {
        const line = funcNode.loc?.start?.line ?? 1;
        context.report({
          line,
          category: 'maintainability',
          ruleId: 'maintainability/deep-nesting',
          severity: 'warning' as IssueSeverity,
          message: `代码嵌套深度为 ${maxNestingDepth} 层，超过推荐限制 ${maxDepth} 层，建议重构以降低复杂度。`,
          suggestion: '考虑使用早期返回、提取函数、使用策略模式等方式减少嵌套。',
          fixSuggestion: {
            title: '减少嵌套层级',
            description: '嵌套过深会导致代码难以理解和维护。应使用提前返回、提取函数等方式减少嵌套。',
            fixType: 'guided' as const,
            steps: [
              { step: 1, action: '使用提前返回', detail: '将错误检查和边界条件提前返回，避免深层嵌套' },
              { step: 2, action: '提取嵌套逻辑', detail: '将嵌套的代码块提取为独立函数' },
              { step: 3, action: '合并条件', detail: '使用逻辑运算符合并多个条件判断' },
            ],
            codeExample: {
              before: `function process(data) {
  if (data) {
    if (data.valid) {
      if (data.items) {
        // 深层嵌套...
      }
    }
  }
}`,
              after: `function process(data) {
  if (!data || !data.valid || !data.items) return;
  // 扁平化的逻辑
  processItems(data.items);
}`,
            },
            references: [
              { title: 'Clean Code - Avoid Deep Nesting', url: 'https://www.oreilly.com/library/view/clean-code-a/9780136083238/' },
              { title: 'Refactoring - Replace Nested Conditional', url: 'https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html' },
            ],
          },
        });
      }
    }

    return {
      FunctionDeclaration(node: BaseASTNode) {
        checkFunction(node);
      },
      FunctionExpression(node: BaseASTNode) {
        checkFunction(node);
      },
      ArrowFunctionExpression(node: BaseASTNode) {
        checkFunction(node);
      },
      MethodDefinition(node: BaseASTNode) {
        const methodDef = node as { value?: BaseASTNode };
        if (methodDef.value) {
          checkFunction(methodDef.value);
        }
      },
    };
  },
};

