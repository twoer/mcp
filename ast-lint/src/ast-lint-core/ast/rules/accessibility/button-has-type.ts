import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode } from '../../ast-types.js';

/**
 * button 元素必须有 type 属性
 *
 * 问题：
 * - 没有 type 属性的 button 默认为 type="submit"，可能导致意外的表单提交
 * - 在表单中使用 button 时，如果忘记指定 type，点击按钮会触发表单提交
 *
 * 正确示例：
 * ```html
 * <button type="button">Click</button>
 * <button type="submit">Submit</button>
 * <button type="reset">Reset</button>
 * ```
 *
 * 错误示例：
 * ```html
 * <button>Click</button>  <!-- 默认为 submit -->
 * ```
 */
export const buttonHasTypeRule: RuleDefinition<AstRuleContext> = {
  id: 'accessibility/button-has-type',
  create(context: AstRuleContext) {
    return {
      VElement(node: BaseASTNode) {
        const element = node as any;

        // 只检查 button 元素
        if (element.name !== 'button') {
          return;
        }

        // 检查是否有 type 属性
        const hasType = element.startTag?.attributes?.some((attr: any) => {
          return attr.key?.name === 'type';
        });

        if (!hasType) {
          const line = element.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'accessibility',
            ruleId: 'accessibility/button-has-type',
            severity: 'warning' as IssueSeverity,
            message: 'button 元素缺少 type 属性，默认为 type="submit" 可能导致意外的表单提交。',
            suggestion: '添加 type 属性：type="button"（普通按钮）、type="submit"（提交表单）或 type="reset"（重置表单）。',
            fixSuggestion: {
              title: '为 button 添加 type 属性',
              description: '明确指定 button 的类型，避免意外的表单提交',
              fixType: 'safe' as const,
              codeExample: {
                before: `<button @click="handleClick">点击</button>`,
                after: `<button type="button" @click="handleClick">点击</button>`,
              },
              references: [
                { title: 'MDN - button type', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button#attr-type' },
              ],
            },
          });
        }
      },
    };
  },
};
