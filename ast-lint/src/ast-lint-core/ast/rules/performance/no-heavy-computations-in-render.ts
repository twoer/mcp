import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, VElement, VIdentifier, VDirective, VDirectiveKey, VExpressionContainer, Identifier } from '../../ast-types.js';

/**
 * 检测模板中可能包含重计算的复杂表达式
 * 重计算应该在计算属性或方法中完成，而非模板中
 */
export const noHeavyComputationsInRenderRule: RuleDefinition<AstRuleContext> = {
  id: 'performance/no-heavy-computations-in-render',
  create(context: AstRuleContext) {
    const maxExpressionLength = (context.ruleOptions?.maxExpressionLength as number | undefined) ?? 100;
    
    return {
      VElement(node: BaseASTNode) {
        const vElement = node as VElement;
        const startTag = vElement.startTag;
        if (!startTag) return;

        const attributes = startTag.attributes ?? [];

        for (const attr of attributes) {
          if (!attr) continue;

          // 检查动态属性绑定 :prop="expression"
          if (attr.type === 'VDirective') {
            const directive = attr as VDirective;
            const key = directive.key;

            if (!key || key.type !== 'VDirectiveKey') continue;

            const directiveName = (key.name as VIdentifier)?.name;

            // 检查 v-bind 或简写形式 :
            if (directiveName === 'bind' || ((key as VDirectiveKey & { raw?: string }).raw?.startsWith(':'))) {
              const value = directive.value;

              // 检查表达式长度
              if (value && value.type === 'VExpressionContainer') {
                const exprContainer = value as VExpressionContainer;
                const expression = exprContainer.expression;
                if (expression && expression.type === 'Identifier') {
                  // 简单标识符，跳过
                  continue;
                }

                // 复杂表达式检测
                if (expression) {
                  const expressionText = getExpressionText(expression);
                  if (expressionText && expressionText.length > maxExpressionLength) {
                    const line = node.loc?.start?.line ?? 1;
                    context.report({
                      line,
                      category: 'performance',
                      ruleId: 'performance/no-heavy-computations-in-render',
                      severity: 'warning' as IssueSeverity,
                      message: `模板中检测到复杂表达式（长度 ${expressionText.length} 字符），建议移到计算属性或方法中。`,
                      suggestion: '将复杂表达式提取为计算属性 computed 或方法 method，提升性能和可读性。',
                      fixSuggestion: {
                        title: '优化渲染性能',
                        description: '将复杂计算移到 computed 或 method 中，避免在每次渲染时重复计算',
                        fixType: 'guided' as const,
                        steps: [
                          { step: 1, action: '识别复杂表达式', detail: '找出模板中的复杂计算逻辑' },
                          { step: 2, action: '提取为 computed', detail: '创建 computed 属性存储计算结果' },
                          { step: 3, action: '更新模板引用', detail: '在模板中使用 computed 属性' },
                        ],
                        codeExample: {
                          before: `<div :style="{ width: calculateWidth() + 'px', height: calculateHeight() + 'px' }">`,
                          after: `<div :style="containerStyle">

<script setup>
const containerStyle = computed(() => ({
  width: calculateWidth() + 'px',
  height: calculateHeight() + 'px'
}));
</script>`,
                        },
                        references: [
                          { title: 'Vue.js Performance', url: 'https://vuejs.org/guide/best-practices/performance.html' },
                        ],
                      },
                    });
                  }
                }
              }
            }
          }
        }
      },
      
      // 检查插值表达式 {{ expression }}
      VText(node: BaseASTNode) {
        const vText = node as BaseASTNode & { value?: string };
        if (!vText.value) return;

        // 检查是否包含插值表达式
        const value = vText.value as string;
        const maxInterpolationLength = (context.ruleOptions?.maxInterpolationLength as number | undefined) ?? 50;

        // 简单检测：如果插值内容过长
        const interpolationMatches = value.match(/\{\{([^}]+)\}\}/g) || [];

        for (const match of interpolationMatches) {
          const content = match.replace(/^\{\{|\}\}$/g, '').trim();
          if (content.length > maxInterpolationLength) {
            const line = node.loc?.start?.line ?? 1;
            context.report({
              line,
              category: 'performance',
              ruleId: 'performance/no-heavy-computations-in-render',
              severity: 'info' as IssueSeverity,
              message: `插值表达式过长（${content.length} 字符），建议移到计算属性中。`,
              suggestion: '将复杂的插值表达式提取为计算属性 computed。',
            });
          }
        }
      },
    };
  },
};

/**
 * 辅助函数：获取表达式文本
 */
function getExpressionText(node: BaseASTNode): string {
  if (!node) return '';

  if (node.type === 'Identifier') {
    return (node as Identifier).name;
  }

  if (node.type === 'Literal') {
    return String((node as BaseASTNode & { value?: unknown }).value);
  }

  if (node.type === 'BinaryExpression') {
    const binExpr = node as BaseASTNode & {
      left: BaseASTNode;
      operator: string;
      right: BaseASTNode;
    };
    return `${getExpressionText(binExpr.left)} ${binExpr.operator} ${getExpressionText(binExpr.right)}`;
  }

  if (node.type === 'LogicalExpression') {
    const logExpr = node as BaseASTNode & {
      left: BaseASTNode;
      operator: string;
      right: BaseASTNode;
    };
    return `${getExpressionText(logExpr.left)} ${logExpr.operator} ${getExpressionText(logExpr.right)}`;
  }

  if (node.type === 'ConditionalExpression') {
    const condExpr = node as BaseASTNode & {
      test: BaseASTNode;
      consequent: BaseASTNode;
      alternate: BaseASTNode;
    };
    return `${getExpressionText(condExpr.test)} ? ${getExpressionText(condExpr.consequent)} : ${getExpressionText(condExpr.alternate)}`;
  }

  if (node.type === 'MemberExpression') {
    const memExpr = node as BaseASTNode & {
      object: BaseASTNode;
      property: BaseASTNode;
    };
    return `${getExpressionText(memExpr.object)}.${getExpressionText(memExpr.property)}`;
  }

  if (node.type === 'CallExpression') {
    const callExpr = node as BaseASTNode & {
      callee: BaseASTNode;
      arguments?: BaseASTNode[];
    };
    const args = callExpr.arguments?.map((arg) => getExpressionText(arg)).join(', ') || '';
    return `${getExpressionText(callExpr.callee)}(${args})`;
  }

  return '';
}
