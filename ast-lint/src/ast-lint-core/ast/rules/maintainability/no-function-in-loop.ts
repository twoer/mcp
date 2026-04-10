import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode } from '../../ast-types.js';

/**
 * 检测在循环中创建函数
 * 在循环中创建函数可能导致闭包问题和性能问题
 */
export const noFunctionInLoopRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/no-function-in-loop',
  create(context: AstRuleContext) {
    const loopTypes = ['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'];

    function isInLoop(node: BaseASTNode): boolean {
      let current: BaseASTNode | undefined = node.parent;
      while (current) {
        if (loopTypes.includes(current.type)) {
          return true;
        }
        // 如果遇到函数边界，停止查找
        if (
          current.type === 'FunctionDeclaration' ||
          current.type === 'FunctionExpression' ||
          current.type === 'ArrowFunctionExpression'
        ) {
          break;
        }
        current = current.parent;
      }
      return false;
    }

    function checkFunction(node: BaseASTNode): void {
      if (!isInLoop(node)) return;

      const line = node.loc?.start?.line ?? 1;
      context.report({
        line,
        category: 'maintainability',
        ruleId: 'maintainability/no-function-in-loop',
        severity: 'warning' as IssueSeverity,
        message: '在循环中创建函数可能导致闭包问题和性能问题。',
        suggestion: '将函数提取到循环外部，或使用立即执行函数表达式（IIFE）来创建新的作用域。',
        fixSuggestion: {
          title: '提取循环中的函数',
          description: '将函数定义移到循环外部，避免重复创建函数',
          fixType: 'guided' as const,
          steps: [
            { step: 1, action: '识别循环中的函数', detail: '找出在循环体内定义的函数' },
            { step: 2, action: '提取到循环外', detail: '将函数定义移到循环之前' },
            { step: 3, action: '处理闭包变量', detail: '如果需要访问循环变量，通过参数传递' },
          ],
          codeExample: {
            before: `for (let i = 0; i < items.length; i++) {
  const handler = () => console.log(items[i]);
  element.addEventListener('click', handler);
}`,
            after: `const createHandler = (item) => () => console.log(item);

for (let i = 0; i < items.length; i++) {
  const handler = createHandler(items[i]);
  element.addEventListener('click', handler);
}`,
          },
          references: [
            { title: 'JavaScript Performance', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures' },
          ],
        },
      });
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
    };
  },
};

