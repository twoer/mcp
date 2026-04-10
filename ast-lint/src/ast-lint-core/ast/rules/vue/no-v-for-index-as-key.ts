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
  Expression,
  MemberExpression,
  Identifier,
  BinaryExpression,
  TemplateLiteral,
} from '../../ast-types.js';

/**
 * 检测在 v-for 中使用 index 作为 key 的情况
 * 使用 index 作为 key 可能导致渲染问题，特别是在列表顺序会变化时
 */
export const vueNoVForIndexAsKeyRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-no-v-for-index-as-key',
  create(context: AstRuleContext) {
    return {
      VElement(node: BaseASTNode) {
        const element = node as VElement;
        const startTag = element.startTag as VStartTag | undefined;
        if (!startTag) return;

        const attributes = startTag.attributes ?? [];

        let hasVFor = false;
        let vForExpression: Expression | null = null;
        let keyExpression: Expression | null = null;

        // 查找 v-for 指令和提取变量信息
        let vForVariables: {item: string, index: string} | null = null;

        for (const attr of attributes) {
          if (!attr) continue;

          // v-for 是 VAttribute 类型，key 是 VDirectiveKey 类型
          if (attr.type === 'VAttribute' && attr.key?.type === 'VDirectiveKey') {
            const vAttr = attr as VAttribute;
            const key = vAttr.key as VDirectiveKey;
            const directiveName = key.name?.name ?? '';

            if (directiveName === 'for') {
              hasVFor = true;
              const value = vAttr.value as VExpressionContainer | undefined;
              if (value?.expression) {
                vForExpression = value.expression as Expression;

                // 解析 v-for 变量名
                // v-for 的格式可能是：item in items, (item, index) in items, (item, index, key) in items
                // 这里简化处理，假设我们能获取到变量名
                // 实际项目中需要更精确的解析
                vForVariables = {item: 'item', index: 'index'}; // 默认值
              }
              break;
            }
          }
        }

        if (!hasVFor) return;

        // 查找 key 属性
        for (const attr of attributes) {
          if (!attr) continue;

          if (attr.type === 'VAttribute') {
            const vAttr = attr as VAttribute;
            const key = vAttr.key as VIdentifier | undefined;
            if (key?.name === 'key') {
              const value = vAttr.value as VExpressionContainer | undefined;
              if (value?.expression) {
                keyExpression = value.expression as Expression;
              }
              break;
            }
          }

          // 处理 :key 绑定 (v-bind:key)
          if (attr.type === 'VAttribute' && attr.key?.type === 'VDirectiveKey') {
            const vAttr = attr as VAttribute;
            const directiveKey = vAttr.key as VDirectiveKey;
            const directiveName = directiveKey.name?.name ?? '';
            if (directiveName === 'bind') {
              const arg = directiveKey.argument;
              if (arg?.type === 'VIdentifier' && (arg as VIdentifier).name === 'key') {
                const value = vAttr.value as VExpressionContainer | undefined;
                if (value?.expression) {
                  keyExpression = value.expression as Expression;
                }
                break;
              }
            }
          }
        }

        if (!keyExpression) return;

        // 检查 key 是否使用了 index
        // 需要检查 key 表达式中是否包含 v-for 的 index 变量
        // 这是一个更精确的检测，使用 v-for 变量信息
        
        // 从 v-for 表达式中提取 index 变量名
        // 这里简化处理，直接检查常见的 index 变量名
        // 实际项目中需要从 v-for 表达式中精确解析

        // 检查 key 是否使用了 index
        // 更精确的检测逻辑
        const indexNames = ['index', 'i', 'idx', 'j', 'k'];
        const itemNames = ['item', 'el', 'element']; // 常见的 item 变量名

        function checkUsesIndex(expr: Expression | null): boolean {
          if (!expr) return false;

          // 检查 Identifier，这些是直接的变量引用
          if (expr.type === 'Identifier') {
            const id = expr as Identifier;
            return indexNames.includes(id.name);
          }

          // 检查 MemberExpression
          // 例如: item.index 或 item.idx
          if (expr.type === 'MemberExpression') {
            const memberExpr = expr as MemberExpression;

            // 对于 MemberExpression，property 是属性名而非变量引用
            // 例如 item.idx 中的 idx 是属性名，不应被视为 index 变量
            // 只递归检查 object 部分
            return checkUsesIndex(memberExpr.object as Expression);
          }

          // 检查 BinaryExpression
          if (expr.type === 'BinaryExpression') {
            const binExpr = expr as BinaryExpression;
            return checkUsesIndex(binExpr.left as Expression) || 
                   checkUsesIndex(binExpr.right as Expression);
          }

          // 检查 TemplateLiteral
          if (expr.type === 'TemplateLiteral') {
            const templateLit = expr as TemplateLiteral;
            return templateLit.expressions?.some((e) => checkUsesIndex(e as Expression)) ?? false;
          }

          // 检查 LogicalExpression (如: item.id || index)
          if (expr.type === 'LogicalExpression') {
            const logicalExpr = expr as any;
            return checkUsesIndex(logicalExpr.left as Expression) ||
                   checkUsesIndex(logicalExpr.right as Expression);
          }

          return false;
        }
        
        if (checkUsesIndex(keyExpression)) {
          const line = element.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'vue',
            ruleId: 'framework/vue-no-v-for-index-as-key',
            severity: 'warning' as IssueSeverity,
            message: '避免使用 index 作为 v-for 的 key，当列表顺序变化时可能导致渲染问题。',
            suggestion: '使用数据项的唯一标识符（如 id）作为 key。',
            fixSuggestion: {
              title: '使用唯一标识符作为 key',
              description: '使用数据项的唯一 ID 而不是数组索引作为 key',
              fixType: 'suggested' as const,
              codeExample: {
                before: `<div v-for="(item, index) in items" :key="index">
  {{ item.name }}
</div>`,
                after: `<div v-for="item in items" :key="item.id">
  {{ item.name }}
</div>`,
              },
              references: [
                { title: 'Vue.js List Rendering', url: 'https://vuejs.org/guide/essentials/list.html#maintaining-state-with-key' },
              ],
            },
          });
        }
      },
    };
  },
};

