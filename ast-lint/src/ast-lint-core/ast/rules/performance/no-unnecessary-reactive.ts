import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, VElement, VIdentifier, CallExpression, Identifier, Literal } from '../../ast-types.js';

/**
 * 检测Vue中不必要的响应式数据
 * 对于只读或基本类型数据，不需要使用ref/reactive
 */
export const noUnnecessaryReactiveRule: RuleDefinition<AstRuleContext> = {
  id: 'performance/no-unnecessary-reactive',
  create(context: AstRuleContext) {
    return {
      CallExpression(node: BaseASTNode) {
        const callNode = node as CallExpression;
        // 检测 reactive() 调用
        if (callNode.callee?.type === 'Identifier' && (callNode.callee as Identifier).name === 'reactive') {
          const args = callNode.arguments;
          if (!args || args.length === 0) return;

          const firstArg = args[0] as BaseASTNode & {
            type: string;
            properties?: Array<BaseASTNode & { value?: BaseASTNode }>;
            elements?: BaseASTNode[];
          };

          // 检查是否是对象字面量
          if (firstArg?.type === 'ObjectExpression') {
            const properties = firstArg.properties || [];

            // 如果属性很少且都是简单类型，可能是过度使用reactive
            if (properties.length <= 3) {
              const allSimpleTypes = properties.every((prop) => {
                if (!prop.value) return true;
                const valueType = prop.value.type;
                return valueType === 'Literal' || valueType === 'Identifier';
              });

              if (allSimpleTypes) {
                const line = node.loc?.start?.line ?? 1;
                context.report({
                  line,
                  category: 'performance',
                  ruleId: 'performance/no-unnecessary-reactive',
                  severity: 'info' as IssueSeverity,
                  message: '对于简单对象，考虑使用 ref 替代 reactive，或直接使用普通对象。',
                  suggestion: '对于小型简单对象，使用 ref({ ... }) 可能更合适，或者如果不需要响应式，使用普通对象。',
                });
              }
            }
          }

          // 检查是否是数组字面量
          if (firstArg?.type === 'ArrayExpression') {
            const elements = firstArg.elements || [];
            if (elements.length <= 2) {
              const line = node.loc?.start?.line ?? 1;
              context.report({
                line,
                category: 'performance',
                ruleId: 'performance/no-unnecessary-reactive',
                severity: 'info' as IssueSeverity,
                message: '对于小型数组，考虑使用 ref 替代 reactive。',
                suggestion: '小型数组使用 ref([...]) 更合适，性能更好。',
              });
            }
          }
        }

        // 检测 ref() 调用中对基本类型的包装
        if (callNode.callee?.type === 'Identifier' && (callNode.callee as Identifier).name === 'ref') {
          const args = callNode.arguments;
          if (!args || args.length === 0) return;

          const firstArg = args[0] as Literal;

          // 如果是字面量，可能不需要响应式（取决于场景）
          if (firstArg?.type === 'Literal') {
            const value = firstArg.value;
            // 常量字面量不需要响应式
            if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
              const line = node.loc?.start?.line ?? 1;
              const valueStr = typeof value === 'string' ? `"${value}"` : String(value);

              context.report({
                line,
                category: 'performance',
                ruleId: 'performance/no-unnecessary-reactive',
                severity: 'info' as IssueSeverity,
                message: '检测到对字面量使用 ref，考虑是否需要响应式。',
                suggestion: '如果值不会改变，考虑使用常量而非 ref。',
                fixSuggestion: {
                  title: '移除不必要的响应式包裹',
                  description: '该值是字面量常量，不会改变，使用 ref() 会增加不必要的性能开销。',
                  fixType: 'safe',
                  autoFix: {
                    before: `ref(${valueStr})`,
                    after: valueStr,
                    description: `移除 ref() 包裹，直接使用常量值`,
                  },
                  codeExample: {
                    before: `const showPanel = ref(false)`,
                    after: `const showPanel = false`,
                  },
                  references: [
                    {
                      title: 'Vue 3 - 响应式基础',
                      url: 'https://cn.vuejs.org/guide/essentials/reactivity-fundamentals.html',
                    },
                  ],
                },
              });
            }
          }
        }
      },
    };
  },
};
