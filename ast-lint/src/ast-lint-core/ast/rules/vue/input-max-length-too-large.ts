import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  VElement,
  VStartTag,
  VDirective,
  VDirectiveKey,
  VIdentifier,
  VAttribute,
  VExpressionContainer,
  VLiteral,
  Literal,
} from '../../ast-types.js';

export const vueInputMaxLengthTooLargeRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-input-max-length-too-large',
  create(context: AstRuleContext) {
    const maxValue = (context.ruleOptions?.maxValue as number | undefined) ?? 200;

    function getMaxlengthValueFromAttribute(attr: VAttribute | VDirective | null): number | undefined {
      if (!attr) return undefined;
      const attrAny = attr as any;

      // 静态属性：maxlength="200"
      if (!attrAny.directive) {
        const vAttr = attr as VAttribute;
        const key = vAttr.key as VIdentifier | undefined;
        if (!key || key.name !== 'maxlength') return undefined;

        const valueNode = vAttr.value as VLiteral | undefined;
        if (!valueNode || typeof valueNode.value !== 'string') return undefined;

        const parsed = Number(valueNode.value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }

      // 绑定属性：:maxlength="200" 或 v-bind:maxlength="200"
      if (attrAny.directive) {
        const directive = attr as VDirective;
        const key = directive.key as VDirectiveKey;
        // 运行时类型检查
        if (!key || key.type !== 'VDirectiveKey' || !key.name) return undefined;

        const directiveName = (key.name as VIdentifier).name ?? '';
        if (directiveName !== 'bind') return undefined;

        const arg = key.argument as VIdentifier | undefined;
        if (!arg || arg.type !== 'VIdentifier' || arg.name !== 'maxlength') return undefined;

        const value = directive.value as VExpressionContainer | undefined;
        const expr = value?.expression as Literal | undefined;
        if (!expr) return undefined;

        if (expr.type === 'Literal' && typeof expr.value === 'number') {
          return expr.value;
        }
        if (expr.type === 'Literal' && typeof expr.value === 'string') {
          const parsed = Number(expr.value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
      }

      return undefined;
    }

    return {
      VElement(node: BaseASTNode) {
        const element = node as VElement;
        const startTag = element.startTag as VStartTag | undefined;
        if (!startTag) return;

        // vue-eslint-parser: VElement.name is a string
        const tagName = typeof element.name === 'string'
          ? element.name
          : (element.name as any)?.name;
        if (tagName !== 'input' && tagName !== 'textarea') return;

        const attributes = startTag.attributes ?? [];

        for (const attr of attributes) {
          const value = getMaxlengthValueFromAttribute(attr);
          if (value === undefined) continue;

          if (value > maxValue) {
            const line = element.loc?.start?.line ?? 1;
            context.report({
              line,
              category: 'vue',
              ruleId: 'framework/vue-input-max-length-too-large',
              severity: 'warning' as IssueSeverity,
              message: `当前 maxlength 为 ${value}，超过推荐上限 ${maxValue}，可能影响输入体验。`,
              suggestion: `建议将 maxlength 调整为 ${maxValue} 或更小的值。`,
              fixSuggestion: {
                title: '调整 maxlength 值',
                description: '将 maxlength 设置为合理的值，提升用户体验',
                fixType: 'safe' as const,
                codeExample: {
                  before: `<input maxlength="500" />`,
                  after: `<input maxlength="200" />`,
                },
                references: [
                  { title: 'WCAG - Input Purposes', url: 'https://www.w3.org/WAI/WCAG21/Understanding/identify-input-purpose.html' },
                  { title: 'UX Best Practices', url: 'https://www.nngroup.com/articles/form-design-best-practices/' },
                ],
              },
            });
            // 一个元素只报一次
            return;
          }
        }
      },
    };
  },
};
