import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, VElement, VStartTag, VDirective, VDirectiveKey, VIdentifier, VAttribute } from '../../ast-types.js';

/**
 * 静态元素标签列表
 * 这些元素通常包含静态内容，可以使用 v-once 优化
 */
const STATIC_ELEMENTS = ['img', 'icon', 'svg', 'path', 'circle', 'rect', 'text'];

/**
 * 检测Vue模板中应该使用 v-once 的静态内容
 * 静态内容使用 v-once 可以避免不必要的重新渲染，提升性能
 */
export const preferVOnceRule: RuleDefinition<AstRuleContext> = {
  id: 'performance/prefer-v-once',
  create(context: AstRuleContext) {
    const ignoreTags = (context.ruleOptions?.ignoreTags as string[] | undefined) ?? [];
    
    return {
      VElement(node: BaseASTNode) {
        const vElement = node as VElement;
        const startTag = vElement.startTag as VStartTag;
        if (!startTag) return;

        // vue-eslint-parser: VElement.name is a string at runtime
        const tagName = typeof vElement.name === 'string'
          ? vElement.name
          : (vElement.name as VIdentifier)?.name;
        
        // 检查是否在忽略列表中
        if (tagName && ignoreTags.includes(tagName)) return;

        const attributes = startTag.attributes ?? [];
        
        // 检查是否已有 v-once
        // vue-eslint-parser: directives have type 'VAttribute' with directive=true
        const hasVOnce = attributes.some((attr: VAttribute | VDirective) => {
          if (!attr) return false;
          // 检查是否是指令（可能是 VDirective 类型或 VAttribute 带 directive 属性）
          const isDirective = attr.type === 'VDirective' || (attr as BaseASTNode & { directive?: boolean }).directive;
          if (!isDirective) return false;
          const key = (attr as VDirective).key;
          if (!key || key.type !== 'VDirectiveKey') return false;
          const directiveName = typeof key.name === 'string'
            ? key.name
            : (key.name as VIdentifier)?.name;
          return directiveName === 'once';
        });

        if (hasVOnce) return;

        // 检查是否是静态元素
        if (tagName && STATIC_ELEMENTS.includes(tagName)) {
          // 检查是否有动态绑定或指令
          // vue-eslint-parser: all attrs have type 'VAttribute', directives have directive=true
          const hasDynamicBindings = attributes.some((attr: VAttribute | VDirective) => {
            if (!attr) return false;
            // 检查是否是指令（可能是 VDirective 类型或 VAttribute 带 directive 属性）
            const isDirective = attr.type === 'VDirective' || (attr as BaseASTNode & { directive?: boolean }).directive;
            if (!isDirective) return false; // 静态属性
            const key = (attr as VDirective).key;
            if (!key || key.type !== 'VDirectiveKey') return false;
            const directiveName = typeof key.name === 'string'
              ? key.name
              : (key.name as VIdentifier)?.name;
            // 排除一些常见的静态指令（v-once, v-bind, v-on）
            // 其他指令如 v-if, v-for, v-show 等都算动态绑定
            return directiveName && directiveName !== 'once' && directiveName !== 'bind' && directiveName !== 'on';
          });

          // 如果是静态元素且没有动态绑定，建议使用 v-once
          if (!hasDynamicBindings) {
            const line = node.loc?.start?.line ?? 1;
            context.report({
              line,
              category: 'performance',
              ruleId: 'performance/prefer-v-once',
              severity: 'info' as IssueSeverity,
              message: `静态元素 <${tagName}> 可以使用 v-once 指令优化性能。`,
              suggestion: '在静态元素上添加 v-once 指令，避免不必要的重新渲染。',
              fixSuggestion: {
                title: '添加 v-once 指令',
                description: 'v-once 指令可以让元素只渲染一次，后续更新会被跳过，提升性能。',
                fixType: 'safe' as const,
                autoFix: {
                  before: `<${tagName}>`,
                  after: `<${tagName} v-once>`,
                  description: '添加 v-once 指令',
                },
                codeExample: {
                  before: '<div>{{ staticText }}</div>',
                  after: '<div v-once>{{ staticText }}</div>',
                },
                references: [
                  {
                    title: 'Vue.js - v-once 指令',
                    url: 'https://cn.vuejs.org/api/built-in-directives.html#v-once',
                  },
                ],
              },
            });
          }
        }
      },
    };
  },
};
