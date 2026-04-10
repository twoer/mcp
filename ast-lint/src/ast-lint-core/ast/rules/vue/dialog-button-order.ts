import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  VElement,
  VStartTag,
  VIdentifier,
  VLiteral,
  VAttribute,
  VDirective,
  VDirectiveKey,
  VExpressionContainer,
} from '../../ast-types.js';

/**
 * 按钮信息接口
 */
interface ButtonInfo {
  element: VElement;
  text: string;
  type: 'primary' | 'cancel' | 'neutral';
  index: number;
  line: number;
}

/**
 * 检测对话框按钮顺序
 * - el-dialog footer 中按钮顺序应为：取消在前，确定在后
 * - 次要操作在前，主要操作在后
 */
export const dialogButtonOrderRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-dialog-button-order',
  create(context: AstRuleContext) {
    /**
     * 获取元素的 class 属性值
     */
    function getClassAttribute(element: VElement): string {
      const startTag = element.startTag as VStartTag;
      if (!startTag?.attributes) return '';

      for (const attr of startTag.attributes) {
        if (attr.type === 'VAttribute') {
          const vAttr = attr as VAttribute;
          const key = vAttr.key as VIdentifier;
          if (key?.name === 'class' && vAttr.value) {
            return (vAttr.value as VLiteral).value ?? '';
          }
        }
      }
      return '';
    }

    /**
     * 检查元素是否有 dialog-footer class
     */
    function hasDialogFooterClass(element: VElement): boolean {
      const classValue = getClassAttribute(element);
      return classValue.includes('dialog-footer');
    }

    /**
     * 获取按钮的文本内容
     */
    function getButtonText(element: VElement): string {
      const children = element.children ?? [];
      let text = '';

      for (const child of children) {
        if (child.type === 'VText' || child.type === 'VLiteral') {
          const content = (child as BaseASTNode & { value?: string }).value ?? '';
          text += content;
        }
        // 递归获取子元素文本
        else if (child.type === 'VElement') {
          text += getButtonText(child as VElement);
        }
        // 处理模板中的插值表达式 {{ }}
        else if (child.type === 'VExpressionContainer') {
          const expr = (child as VExpressionContainer).expression;
          if (expr && expr.type === 'Identifier') {
            // expr is a regular Identifier, not VIdentifier
            const identifier = expr as { name?: string };
            text += identifier.name ?? '';
          }
        }
      }

      return text.trim();
    }

    /**
     * 获取按钮类型（从 type 属性或 el-button 的 type 属性）
     */
    function getButtonType(element: VElement): 'primary' | 'cancel' | 'neutral' {
      const startTag = element.startTag as VStartTag;
      if (!startTag?.attributes) return 'neutral';

      let isPrimary = false;
      let isPlain = false;

      for (const attr of startTag.attributes) {
        if (attr.type === 'VAttribute') {
          const vAttr = attr as VAttribute;
          const key = vAttr.key as VIdentifier;

          // 检查 type 属性
          if (key?.name === 'type' && vAttr.value) {
            const typeValue = (vAttr.value as VLiteral).value ?? '';
            if (typeValue === 'primary' || typeValue === 'success' || typeValue === 'danger') {
              isPrimary = true;
            }
          }

          // 检查 plain 属性（plain 按钮通常是次要操作）
          if (key?.name === 'plain') {
            isPlain = true;
          }
        }
        // 检查 v-bind:type 或 :type 指令
        else if (attr.type === 'VDirective') {
          const directive = attr as VDirective;
          const key = directive.key as VDirectiveKey;
          if (key?.name && (key.name as VIdentifier).name === 'bind') {
            const arg = key.argument;
            if (arg && arg.type === 'VIdentifier' && (arg as VIdentifier).name === 'type') {
              // 动态 type，检查值
              if (directive.value?.expression) {
                const expr = directive.value.expression;
                if (expr.type === 'Literal' && typeof expr.value === 'string') {
                  if (expr.value === 'primary' || expr.value === 'success' || expr.value === 'danger') {
                    isPrimary = true;
                  }
                }
              }
            }
          }
        }
      }

      // 根据文本判断
      const text = getButtonText(element).toLowerCase();

      // 取消/关闭类按钮
      const cancelKeywords = ['取消', 'cancel', '关闭', 'close', '关 闭', '取 消', '返 回', 'return', 'reset', '重置'];
      for (const keyword of cancelKeywords) {
        if (text.includes(keyword)) {
          return 'cancel';
        }
      }

      // 确认/提交类按钮
      const confirmKeywords = ['确定', 'confirm', '确认', 'submit', '提交', '保存', 'save', 'ok', 'yes', '是', '删除', 'delete'];
      for (const keyword of confirmKeywords) {
        if (text.includes(keyword)) {
          return 'primary';
        }
      }

      // 如果有 primary type 属性但没有匹配到取消关键词，视为主要按钮
      if (isPrimary && !isPlain) {
        return 'primary';
      }

      // plain 按钮通常是次要操作
      if (isPlain) {
        return 'cancel';
      }

      return 'neutral';
    }

    /**
     * 从元素中提取所有按钮
     */
    function extractButtons(element: VElement): ButtonInfo[] {
      const buttons: ButtonInfo[] = [];
      const children = element.children ?? [];
      let index = 0;

      for (const child of children) {
        if (child.type === 'VElement') {
          const vChild = child as VElement;
          // vue-eslint-parser 返回 name 为字符串
          const rawName = (vChild as unknown as { name?: string | VIdentifier }).name;
          const tagName = typeof rawName === 'string' ? rawName : (rawName as VIdentifier)?.name ?? '';

          // 检查是否是按钮元素
          if (tagName === 'el-button' || tagName === 'button' || tagName === 'ElButton') {
            const buttonType = getButtonType(vChild);
            buttons.push({
              element: vChild,
              text: getButtonText(vChild),
              type: buttonType,
              index: index++,
              line: vChild.loc?.start?.line ?? 1,
            });
          }
          // 递归检查子元素
          else {
            const nestedButtons = extractButtons(vChild);
            buttons.push(...nestedButtons.map(b => ({ ...b, index: index++ })));
          }
        }
      }

      return buttons;
    }

    /**
     * 检查对话框按钮顺序
     */
    function checkDialogButtonOrder(element: VElement) {
      const buttons = extractButtons(element);

      // 至少需要 2 个按钮才检查顺序
      if (buttons.length < 2) return;

      // 找到所有主要按钮和取消按钮
      const primaryButtons = buttons.filter(b => b.type === 'primary');
      const cancelButtons = buttons.filter(b => b.type === 'cancel');

      // 如果没有明确的主要/取消按钮，跳过检查
      if (primaryButtons.length === 0 || cancelButtons.length === 0) return;

      // 检查顺序：取消按钮应该在主要按钮之前
      const firstPrimaryIndex = Math.min(...primaryButtons.map(b => b.index));
      const lastCancelButton = cancelButtons[cancelButtons.length - 1];

      if (lastCancelButton.index > firstPrimaryIndex) {
        const line = element.loc?.start?.line ?? 1;
        context.report({
          line,
          category: 'vue',
          ruleId: 'framework/vue-dialog-button-order',
          severity: 'warning' as IssueSeverity,
          message: '对话框按钮顺序不正确：取消按钮应该在确定按钮之前。',
          suggestion: '建议调整按钮顺序为：取消（次要操作）在前，确定（主要操作）在后。',
          fixSuggestion: {
            title: '调整对话框按钮顺序',
            description: '按照 Material Design 和 WCAG 规范，将取消按钮放在确定按钮之前',
            fixType: 'guided' as const,
            steps: [
              { step: 1, action: '识别按钮类型', detail: '确定哪些是主要操作按钮，哪些是次要操作按钮' },
              { step: 2, action: '调整顺序', detail: '将取消/关闭按钮移到确定/提交按钮之前' },
            ],
            codeExample: {
              before: `<el-dialog>
  <template #footer>
    <el-button type="primary" @click="confirm">确定</el-button>
    <el-button @click="cancel">取消</el-button>
  </template>
</el-dialog>`,
              after: `<el-dialog>
  <template #footer>
    <el-button @click="cancel">取消</el-button>
    <el-button type="primary" @click="confirm">确定</el-button>
  </template>
</el-dialog>`,
            },
            references: [
              { title: 'Material Design - Dialogs', url: 'https://material.io/components/dialogs' },
              { title: 'WCAG - Consistent Identification', url: 'https://www.w3.org/WAI/WCAG21/Understanding/consistent-identification.html' },
            ],
          },
        });
      }
    }

    return {
      VElement(node: BaseASTNode) {
        const vElement = node as VElement;
        // vue-eslint-parser 返回 name 为字符串
        const rawName = (vElement as unknown as { name?: string | VIdentifier }).name;
        const tagName = typeof rawName === 'string' ? rawName : (rawName as VIdentifier)?.name ?? '';

        // 只检查 el-dialog 元素，避免重复报告
        if (tagName === 'el-dialog' || tagName === 'ElDialog') {
          // 检查 dialog 内的 footer
          const children = vElement.children ?? [];
          for (const child of children) {
            if (child.type === 'VElement') {
              const childElement = child as VElement;
              const childRawName = (childElement as unknown as { name?: string | VIdentifier }).name;
              const childTagName = typeof childRawName === 'string' ? childRawName : (childRawName as VIdentifier)?.name ?? '';

              // 检查 template #footer 或具有 dialog-footer class 的元素
              if (childTagName === 'template') {
                const templateChildren = childElement.children ?? [];
                for (const templateChild of templateChildren) {
                  if (templateChild.type === 'VElement') {
                    checkDialogButtonOrder(templateChild as VElement);
                  }
                }
              } else if (hasDialogFooterClass(childElement)) {
                checkDialogButtonOrder(childElement);
              }
            }
          }
        }
      },
    };
  },
};
