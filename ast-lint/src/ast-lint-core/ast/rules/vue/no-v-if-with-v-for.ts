import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode } from '../../ast-types.js';

/**
 * 禁止在同一元素上同时使用 v-if 和 v-for
 *
 * 问题：
 * - Vue 2: v-for 优先级高于 v-if，导致先循环再判断，性能浪费
 * - Vue 3: v-if 优先级高于 v-for，可能导致访问未定义的变量
 * - 两个版本行为不一致，容易出错
 *
 * 正确示例：
 * ```vue
 * <!-- 使用 computed 过滤 -->
 * <div v-for="item in filteredItems" :key="item.id">{{ item.name }}</div>
 *
 * <!-- 或使用 template 包裹 -->
 * <template v-if="shouldShow">
 *   <div v-for="item in items" :key="item.id">{{ item.name }}</div>
 * </template>
 * ```
 *
 * 错误示例：
 * ```vue
 * <div v-for="item in items" v-if="item.isActive" :key="item.id">
 *   {{ item.name }}
 * </div>
 * ```
 */
export const noVIfWithVForRule: RuleDefinition<AstRuleContext> = {
  id: 'vue/no-v-if-with-v-for',
  create(context: AstRuleContext) {
    return {
      VElement(node: BaseASTNode) {
        const element = node as any;

        if (!element.startTag?.attributes) {
          return;
        }

        let hasVFor = false;
        let hasVIf = false;

        for (const attr of element.startTag.attributes) {
          if (attr.directive) {
            if (attr.key?.name?.name === 'for') {
              hasVFor = true;
            }
            if (attr.key?.name?.name === 'if') {
              hasVIf = true;
            }
          }
        }

        if (hasVFor && hasVIf) {
          const line = element.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'vue',
            ruleId: 'vue/no-v-if-with-v-for',
            severity: 'error' as IssueSeverity,
            message: '不要在同一元素上同时使用 v-if 和 v-for，这会导致性能问题和不一致的行为。',
            suggestion: '使用 computed 属性过滤数据，或将 v-if 移到外层 <template> 标签。',
            fixSuggestion: {
              title: '拆分 v-if 和 v-for',
              description: '将 v-if 和 v-for 分离到不同元素，避免性能问题',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '选择方案', detail: '使用 computed 过滤数据，或使用 template 包裹' },
                { step: 2, action: '实现拆分', detail: '将 v-if 移到外层或创建 computed 属性' },
              ],
              codeExample: {
                before: `<div v-for="item in items" v-if="item.isActive" :key="item.id">
  {{ item.name }}
</div>`,
                after: `<!-- 方案1: 使用 computed 过滤 -->
<div v-for="item in activeItems" :key="item.id">
  {{ item.name }}
</div>

<script setup>
const activeItems = computed(() => items.filter(item => item.isActive));
</script>

<!-- 方案2: 使用 template 包裹 -->
<template v-if="shouldShow">
  <div v-for="item in items" :key="item.id">
    {{ item.name }}
  </div>
</template>`,
              },
              references: [
                { title: 'Vue.js Style Guide', url: 'https://vuejs.org/style-guide/rules-essential.html#avoid-v-if-with-v-for' },
              ],
            },
          });
        }
      },
    };
  },
};
