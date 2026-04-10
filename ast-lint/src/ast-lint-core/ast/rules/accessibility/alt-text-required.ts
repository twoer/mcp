import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  VElement,
  VStartTag,
  VAttribute,
  VIdentifier,
} from '../../ast-types.js';

/**
 * 检测图片元素缺少 alt 属性
 * 提高网页可访问性，确保屏幕阅读器能够正确读取图片内容
 */
export const altTextRequiredRule: RuleDefinition<AstRuleContext> = {
  id: 'accessibility/alt-text-required',
  create(context: AstRuleContext) {
    /**
     * 检查是否是装饰性图片（通过 role="presentation" 或 role="none" 判断）
     */
    function isDecorativeImage(element: VElement): boolean {
      const startTag = element.startTag as VStartTag | undefined;
      if (!startTag) return false;

      for (const attr of startTag.attributes ?? []) {
        if (!attr || attr.type !== 'VAttribute') continue;
        const vAttr = attr as VAttribute;
        const key = vAttr.key as VIdentifier | undefined;
        if (key?.name === 'role') {
          const value = vAttr.value;
          if (value && typeof value === 'object' && 'value' in value) {
            const roleValue = (value as { value: string }).value;
            return roleValue === 'presentation' || roleValue === 'none';
          }
        }
      }
      return false;
    }

    return {
      VElement(node: BaseASTNode) {
        const element = node as VElement;
        const startTag = element.startTag as VStartTag | undefined;
        if (!startTag) return;

        // vue-eslint-parser: VElement.name is a string at runtime
        const tagName = typeof element.name === 'string'
          ? element.name
          : (element.name as VIdentifier)?.name;
        if (!tagName || tagName !== 'img') return;

        // 检查是否有 alt 属性及其值
        let hasAlt = false;
        let altValue: string | undefined;

        for (const attr of startTag.attributes ?? []) {
          if (!attr || attr.type !== 'VAttribute') continue;
          const vAttr = attr as VAttribute;
          const key = vAttr.key as VIdentifier | undefined;
          if (key?.name === 'alt') {
            hasAlt = true;
            // 获取 alt 的值
            const value = vAttr.value;
            if (value && typeof value === 'object' && 'value' in value) {
              altValue = (value as { value: string }).value;
            }
            break;
          }
        }

        const line = element.loc?.start?.line ?? 1;

        if (!hasAlt) {
          context.report({
            line,
            category: 'accessibility',
            ruleId: 'accessibility/alt-text-required',
            severity: 'error' as IssueSeverity,
            message: '<img> 元素必须包含 alt 属性以提高可访问性。',
            suggestion: '为 <img> 元素添加 alt 属性，描述图片内容，以帮助屏幕阅读器用户理解图片。',
            fixSuggestion: {
              title: '为图片添加 alt 属性',
              description: 'alt 属性为屏幕阅读器用户提供图片的文字描述，是 Web 可访问性的基本要求。',
              fixType: 'suggested',
              steps: [
                {
                  step: 1,
                  action: '识别图片内容',
                  detail: '确定图片的用途：是 logo、图标、内容图片还是装饰性图片',
                },
                {
                  step: 2,
                  action: '添加 alt 属性',
                  detail: '根据图片类型添加合适的描述',
                },
              ],
              codeExample: {
                before: '<img src="logo.png">',
                after: '<img src="logo.png" alt="公司 Logo">',
              },
              references: [
                {
                  title: 'WCAG 2.1 - 非文本内容',
                  url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
                },
                {
                  title: 'MDN - img alt 属性',
                  url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/img#alt',
                },
              ],
            },
          });
        } else if (altValue === '' && !isDecorativeImage(element)) {
          // 空 alt 值（装饰性图片除外）
          context.report({
            line,
            category: 'accessibility',
            ruleId: 'accessibility/alt-text-required',
            severity: 'info' as IssueSeverity,  // 从 warning 降为 info
            message: '<img> 元素的 alt 属性为空。空 alt 仅适用于装饰性图片。',
            suggestion: '为图片添加有意义的 alt 描述，或添加 role="presentation" 标记为装饰性图片。',
            fixSuggestion: {
              title: '为空 alt 添加描述或标记为装饰性',
              description: '空 alt 会让屏幕阅读器跳过该图片，只适用于纯装饰性图片。',
              fixType: 'suggested',
              steps: [
                {
                  step: 1,
                  action: '判断图片类型',
                  detail: '如果是装饰性图片，添加 role="presentation"；否则添加描述性文字',
                },
              ],
              codeExample: {
                before: '<img src="icon.png" alt="">',
                after: '<img src="icon.png" alt="搜索图标">\n<!-- 或装饰性图片 -->\n<img src="decoration.png" alt="" role="presentation">',
              },
            },
          });
        }
      },
    };
  },
};
