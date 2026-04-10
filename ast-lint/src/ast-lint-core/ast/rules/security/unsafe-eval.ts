import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { CallExpression, NewExpression, Literal, TemplateLiteral, BaseASTNode } from '../../ast-types.js';

const SUSPICIOUS_TIMER_NAMES = ['setTimeout', 'setInterval'];

/**
 * 检查节点是否为字符串类型字面量
 */
function isStringLikeLiteral(node: BaseASTNode | null | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Literal') {
    return typeof (node as Literal).value === 'string';
  }
  if (node.type === 'TemplateLiteral') return true;
  return false;
}

function report(context: AstRuleContext, line: number, message: string): void {
  context.report({
    line,
    category: 'security',
    ruleId: 'security/unsafe-eval',
    severity: 'error' as IssueSeverity,
    message,
    fixSuggestion: {
      title: '避免使用 eval()',
      description: 'eval() 和 Function 构造器会执行动态字符串代码，存在严重的安全风险。应使用更安全的替代方案。',
      fixType: 'manual' as const,
      codeExample: {
        before: `// 危险：使用 eval
const result = eval(userInput);
setTimeout("alert('hello')", 1000);`,
        after: `// 安全：使用 JSON.parse 或函数引用
const result = JSON.parse(userInput);
setTimeout(() => alert('hello'), 1000);`,
      },
      references: [
        { title: 'MDN - eval()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval' },
        { title: 'OWASP - Code Injection', url: 'https://owasp.org/www-community/attacks/Code_Injection' },
      ],
    },
  });
}

export const unsafeEvalRule: RuleDefinition<AstRuleContext> = {
  id: 'security/unsafe-eval',
  create(context: AstRuleContext) {
    return {
      CallExpression(node: BaseASTNode) {
        const callExpr = node as CallExpression;
        const callee = callExpr.callee;
        const args = callExpr.arguments ?? [];

        // 检查直接的 eval 调用
        if (callee && callee.type === 'Identifier' && callee.name === 'eval') {
          const line = node.loc?.start?.line ?? 1;
          report(context, line, '禁止使用 eval() 执行动态字符串代码。');
          return;
        }

        // 检查直接的危险定时器调用
        if (callee && callee.type === 'Identifier' && SUSPICIOUS_TIMER_NAMES.includes(callee.name)) {
          const firstArg = args[0];
          if (isStringLikeLiteral(firstArg as BaseASTNode | null)) {
            const line = node.loc?.start?.line ?? 1;
            report(
              context,
              line,
              `禁止在 ${callee.name} 中使用字符串形式的回调，可能导致代码注入风险。`,
            );
          }
        }

        // 检查通过 MemberExpression 的调用（包括可选链式调用）
        if (callee && callee.type === 'MemberExpression') {
          const property = callee.property;
          const object = callee.object;

          if (property && property.type === 'Identifier') {
            const methodName = property.name;

            // 检查危险定时器方法调用（但跳过 window.setTimeout 等全局对象调用）
            if (SUSPICIOUS_TIMER_NAMES.includes(methodName)) {
              const firstArg = args[0];
              if (isStringLikeLiteral(firstArg as BaseASTNode | null)) {
                const line = node.loc?.start?.line ?? 1;
                report(
                  context,
                  line,
                  `禁止在 ${methodName} 中使用字符串形式的回调，可能导致代码注入风险。`,
                );
              }
            }

            // 对于 eval，只检测直接调用，不检测通过对象访问的 eval（如 window.eval）
            // 因为 window.eval 在某些上下文中可能是安全的，而且这通常是另一个安全问题的范畴
          }
        }
      },

      NewExpression(node: BaseASTNode) {
        const newExpr = node as NewExpression;
        const callee = newExpr.callee;

        if (callee && callee.type === 'Identifier' && callee.name === 'Function') {
          const line = node.loc?.start?.line ?? 1;
          report(context, line, '禁止使用 Function 构造器执行动态字符串代码。');
        }
      },
    };
  },
};
