import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, VElement, VDirective, VDirectiveKey, VIdentifier, VExpressionContainer, Expression } from '../../ast-types.js';

/**
 * 检测模板中的复杂表达式
 * 模板中应该避免复杂的表达式，应该使用 computed 属性或方法
 */
export const vueNoComplexExpressionsInTemplateRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-no-complex-expressions-in-template',
  create(context: AstRuleContext) {
    const maxDepth = (context.ruleOptions?.maxDepth as number | undefined) ?? 3;

    function calculateExpressionDepth(expr: Expression | null, depth = 0): number {
      if (!expr || depth > maxDepth) return depth;

      let maxChildDepth = depth;

      // 检查各种表达式类型
      if (expr.type === 'BinaryExpression' || expr.type === 'LogicalExpression') {
        const binExpr = expr as { left?: Expression; right?: Expression };
        maxChildDepth = Math.max(
          calculateExpressionDepth(binExpr.left as Expression, depth + 1),
          calculateExpressionDepth(binExpr.right as Expression, depth + 1),
        );
      } else if (expr.type === 'ConditionalExpression') {
        const condExpr = expr as { test?: Expression; consequent?: Expression; alternate?: Expression };
        maxChildDepth = Math.max(
          calculateExpressionDepth(condExpr.test as Expression, depth + 1),
          calculateExpressionDepth(condExpr.consequent as Expression, depth + 1),
          calculateExpressionDepth(condExpr.alternate as Expression, depth + 1),
        );
      } else if (expr.type === 'CallExpression') {
        const callExpr = expr as { arguments?: Expression[] };
        if (callExpr.arguments) {
          for (const arg of callExpr.arguments) {
            maxChildDepth = Math.max(maxChildDepth, calculateExpressionDepth(arg as Expression, depth + 1));
          }
        }
      } else if (expr.type === 'MemberExpression') {
        const memberExpr = expr as { object?: Expression; property?: Expression };
        maxChildDepth = Math.max(
          calculateExpressionDepth(memberExpr.object as Expression, depth + 1),
          calculateExpressionDepth(memberExpr.property as Expression, depth + 1),
        );
      }

      return maxChildDepth;
    }

    return {
      VElement(node: BaseASTNode) {
        const vElement = node as VElement;
        const startTag = vElement.startTag;
        if (!startTag) return;

        const attributes = startTag.attributes ?? [];

        for (const attr of attributes) {
          if (!attr) continue;
          // vue-eslint-parser: directives have type 'VAttribute' with directive=true
          const attrAny = attr as any;
          if (!attrAny.directive) continue;

          const directive = attr as VDirective;
          const key = directive.key as VDirectiveKey;
          if (!key || key.type !== 'VDirectiveKey' || !key.name) continue;

          const value = directive.value;
          if (!value || value.type !== 'VExpressionContainer') continue;

          const exprContainer = value as VExpressionContainer;
          const expression = exprContainer.expression as Expression | null;

          if (!expression) continue;

          const depth = calculateExpressionDepth(expression);
          if (depth > maxDepth) {
            const line = node.loc?.start?.line ?? 1;
            context.report({
              line,
              category: 'vue',
              ruleId: 'framework/vue-no-complex-expressions-in-template',
              severity: 'warning' as IssueSeverity,
              message: `模板中的表达式过于复杂（深度 ${depth}），应该使用 computed 属性或方法。`,
              suggestion: '将复杂表达式提取到 computed 属性或方法中，提高可读性和性能。',
              fixSuggestion: {
                title: '提取复杂表达式为 computed',
                description: '将模板中的复杂表达式提取为 computed 属性，提高可读性和性能',
                fixType: 'guided' as const,
                steps: [
                  { step: 1, action: '创建 computed 属性', detail: '在 script 中创建一个新的 computed 属性' },
                  { step: 2, action: '移动表达式逻辑', detail: '将模板中的复杂表达式逻辑移到 computed 中' },
                  { step: 3, action: '替换模板引用', detail: '在模板中使用新的 computed 属性名' },
                ],
                codeExample: {
                  before: `<div v-if="user.age > 18 && user.status === 'active' && user.verified">...</div>`,
                  after: `<div v-if="isEligibleUser">...</div>

<script setup>
const isEligibleUser = computed(() =>
  user.age > 18 && user.status === 'active' && user.verified
);
</script>`,
                },
                references: [
                  { title: 'Vue.js Best Practices', url: 'https://vuejs.org/style-guide/' },
                  { title: 'Vue.js Computed Properties', url: 'https://vuejs.org/guide/essentials/computed.html' },
                ],
              },
            });
          }
        }
      },
    };
  },
};

