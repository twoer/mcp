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
} from '../../ast-types.js';

/**
 * 检测 template 标签上使用 key 的情况
 * template 标签上的 key 应该移到其子元素上
 */
export const vueNoTemplateKeyRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-no-template-key',
  create(context: AstRuleContext) {
    return {
      VElement(node: BaseASTNode) {
        const element = node as VElement;
        // vue-eslint-parser: VElement.name is a string
        const tagName = typeof element.name === 'string'
          ? element.name
          : (element.name as any)?.name;
        if (tagName !== 'template') return;

        const startTag = element.startTag as VStartTag | undefined;
        if (!startTag) return;

        const attributes = startTag.attributes ?? [];

        // 检查是否有 key 属性
        for (const attr of attributes) {
          if (!attr) continue;
          const attrAny = attr as any;

          if (!attrAny.directive) {
            // 静态属性: key="xxx"
            const vAttr = attr as VAttribute;
            const key = vAttr.key as VIdentifier | undefined;
            if (key?.name === 'key') {
              const line = element.loc?.start?.line ?? 1;
              context.report({
                line,
                category: 'vue',
                ruleId: 'framework/vue-no-template-key',
                severity: 'warning' as IssueSeverity,
                message: 'template 标签上的 key 应该移到其唯一的子元素上，而不是放在 template 上。',
                suggestion: '将 key 属性从 template 标签移到其子元素上。',
                fixSuggestion: {
                  title: '移除 template 上的 key',
                  description: '将 key 从 template 标签移到其子元素上',
                  fixType: 'safe' as const,
                  codeExample: {
                    before: `<template v-for="item in items" :key="item.id">
  <div>{{ item.name }}</div>
</template>`,
                    after: `<template v-for="item in items">
  <div :key="item.id">{{ item.name }}</div>
</template>`,
                  },
                  references: [
                    { title: 'Vue.js Template Syntax', url: 'https://vuejs.org/guide/essentials/template-syntax.html' },
                  ],
                },
              });
              return;
            }
          }

          if (attrAny.directive) {
            const key = attrAny.key as VDirectiveKey;
            // 运行时类型检查，提高健壮性
            if (!key || key.type !== 'VDirectiveKey' || !key.name) continue;

            const directiveName = (key.name as VIdentifier).name ?? '';
            if (directiveName === 'bind') {
              const arg = key.argument as VIdentifier | undefined;
              if (arg?.type === 'VIdentifier' && arg.name === 'key') {
                const line = element.loc?.start?.line ?? 1;
                context.report({
                  line,
                  category: 'vue',
                  ruleId: 'framework/vue-no-template-key',
                  severity: 'warning' as IssueSeverity,
                  message: 'template 标签上的 key 应该移到其唯一的子元素上，而不是放在 template 上。',
                  suggestion: '将 key 属性从 template 标签移到其子元素上。',
                });
                return;
              }
            }
          }
        }
      },
    };
  },
};

