import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  VElement,
  VStartTag,
  VExpressionContainer,
} from '../../ast-types.js';

/**
 * 检测空的标题元素（h1-h6）
 * 空标题会影响可访问性和 SEO
 */
export const noEmptyHeadingRule: RuleDefinition<AstRuleContext> = {
  id: 'accessibility/no-empty-heading',
  create(context: AstRuleContext) {
    const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

    /**
     * 检查元素是否有内容
     */
    function hasContent(element: VElement): boolean {
      const children = element.children;
      if (!children || children.length === 0) {
        return false;
      }

      for (const child of children) {
        // VText 节点
        if (child.type === 'VText' || (child as { type?: string }).type === 'VText') {
          const textChild = child as { value?: string };
          const text = textChild.value?.trim();
          if (text && text.length > 0) {
            return true;
          }
        } else if (child.type === 'VExpressionContainer') {
          // 如果有表达式容器（如 {{ title }}），认为可能有内容
          const expr = (child as VExpressionContainer).expression;
          if (expr) {
            return true;
          }
        } else if (child.type === 'VElement') {
          // 递归检查子元素
          if (hasContent(child as VElement)) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * 检查是否有 aria-label 或 title 属性
     */
    function hasAriaLabel(element: VElement): boolean {
      const startTag = element.startTag as VStartTag | undefined;
      if (!startTag) return false;

      for (const attr of startTag.attributes ?? []) {
        if (!attr || attr.type !== 'VAttribute') continue;
        const vAttr = attr as { key?: { name?: string }; value?: unknown };
        const keyName = vAttr.key?.name;
        if (keyName === 'aria-label' || keyName === 'title') {
          return true;
        }
      }
      return false;
    }

    return {
      VElement(node: BaseASTNode) {
        const element = node as VElement;
        // vue-eslint-parser: VElement.name is a string at runtime
        const tagName = typeof element.name === 'string'
          ? element.name
          : (element.name as { name?: string })?.name;

        if (!tagName || !headingTags.includes(tagName)) return;

        // 检查是否有内容
        if (!hasContent(element) && !hasAriaLabel(element)) {
          const line = element.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'accessibility',
            ruleId: 'accessibility/no-empty-heading',
            severity: 'warning' as IssueSeverity,
            message: `标题元素 <${tagName}> 内容为空，这可能影响可访问性和 SEO。`,
            suggestion: '为标题添加有意义的文本内容，或如果标题不需要显示，考虑使用其他元素。',
            fixSuggestion: {
              title: '为标题添加内容',
              description: '标题元素必须包含文本内容或 aria-label 属性',
              fixType: 'manual' as const,
              codeExample: {
                before: `<h1></h1>`,
                after: `<!-- 方案1: 添加文本内容 -->
<h1>页面标题</h1>

<!-- 方案2: 使用 aria-label -->
<h1 aria-label="页面标题">
  <img src="logo.png" alt="Logo">
</h1>`,
              },
              references: [
                { title: 'WCAG - Headings', url: 'https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels.html' },
                { title: 'MDN - Heading elements', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements' },
              ],
            },
          });
        }
      },
    };
  },
};
