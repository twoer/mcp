import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode } from '../../ast-types.js';

/**
 * 图片和 iframe 应该使用懒加载
 *
 * 问题：
 * - 不使用懒加载会导致页面加载时下载所有图片，影响性能
 * - 首屏之外的图片也会立即加载，浪费带宽
 * - 影响 LCP (Largest Contentful Paint) 等性能指标
 *
 * 正确示例：
 * ```html
 * <img src="image.jpg" loading="lazy" alt="description">
 * <iframe src="video.html" loading="lazy"></iframe>
 * ```
 *
 * 错误示例：
 * ```html
 * <img src="image.jpg" alt="description">
 * <iframe src="video.html"></iframe>
 * ```
 */
export const missingLazyLoadRule: RuleDefinition<AstRuleContext> = {
  id: 'performance/missing-lazy-load',
  create(context: AstRuleContext) {
    return {
      VElement(node: BaseASTNode) {
        const element = node as any;

        // 只检查 img 和 iframe 元素
        if (element.name !== 'img' && element.name !== 'iframe') {
          return;
        }

        if (!element.startTag?.attributes) {
          return;
        }

        // 检查是否有 loading 属性
        const hasLoading = element.startTag.attributes.some((attr: any) => {
          return attr.key?.name === 'loading';
        });

        // 检查是否在首屏（通过检查是否在 v-for 或列表中）
        // 简化版本：如果没有 loading 属性就报告
        if (!hasLoading) {
          const line = element.loc?.start?.line ?? 1;
          const elementType = element.name;

          context.report({
            line,
            category: 'performance',
            ruleId: 'performance/missing-lazy-load',
            severity: 'info' as IssueSeverity,
            message: `${elementType} 元素缺少 loading="lazy" 属性，可能影响页面加载性能。`,
            suggestion: `添加 loading="lazy" 属性以启用懒加载，或使用 loading="eager" 明确表示需要立即加载（如首屏图片）。`,
            fixSuggestion: {
              title: '添加懒加载属性',
              description: '为图片或 iframe 添加 loading="lazy" 属性可以延迟加载非首屏内容，提升页面性能。',
              fixType: 'safe',
              autoFix: {
                before: `<${elementType} src="...">`,
                after: `<${elementType} src="..." loading="lazy">`,
                description: `添加 loading="lazy" 属性`,
              },
              codeExample: {
                before: elementType === 'img'
                  ? '<img src="image.jpg" alt="description">'
                  : '<iframe src="video.html"></iframe>',
                after: elementType === 'img'
                  ? '<img src="image.jpg" alt="description" loading="lazy">'
                  : '<iframe src="video.html" loading="lazy"></iframe>',
              },
              references: [
                {
                  title: 'MDN - loading 属性',
                  url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/img#loading',
                },
                {
                  title: 'Web.dev - 浏览器级图片懒加载',
                  url: 'https://web.dev/browser-level-image-lazy-loading/',
                },
              ],
            },
          });
        }
      },
    };
  },
};
