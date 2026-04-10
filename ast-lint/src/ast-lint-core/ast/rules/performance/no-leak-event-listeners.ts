import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, CallExpression, MemberExpression, Identifier, Literal } from '../../ast-types.js';

/**
 * 检测事件监听器泄漏
 * 添加了事件监听器但没有对应的移除操作可能导致内存泄漏
 */
export const noLeakEventListenersRule: RuleDefinition<AstRuleContext> = {
  id: 'performance/no-leak-event-listeners',
  create(context: AstRuleContext) {
    const eventListeners = new Map<string, {
      line: number;
      target: string;
      eventType: string;
    }>();

    return {
      CallExpression(node: BaseASTNode) {
        const callNode = node as CallExpression;
        // 检测 addEventListener 调用
        if (callNode.callee?.type === 'MemberExpression') {
          const memberExpr = callNode.callee as MemberExpression;
          const property = memberExpr.property as Identifier;

          if (property?.name === 'addEventListener') {
            const args = callNode.arguments;
            if (args && args.length >= 2) {
              const eventType = args[0] as Literal;
              const eventTypeStr = eventType?.type === 'Literal' ? eventType.value : 'unknown';

              // 获取目标对象标识符
              const targetObj = memberExpr.object;
              let targetKey = 'unknown';
              if (targetObj?.type === 'Identifier') {
                targetKey = (targetObj as Identifier).name;
              } else if (targetObj?.type === 'MemberExpression') {
                const nestedMember = targetObj as MemberExpression;
                if (nestedMember.object?.type === 'Identifier') {
                  targetKey = (nestedMember.object as Identifier).name;
                }
              }

              // 获取处理函数标识符（用于更精确的匹配）
              const handler = args[1] as BaseASTNode;
              let handlerKey = 'unknown';
              if (handler?.type === 'Identifier') {
                handlerKey = (handler as Identifier).name;
              } else if (handler?.type === 'ArrowFunctionExpression' || handler?.type === 'FunctionExpression') {
                handlerKey = 'anonymous';
              }

              const line = node.loc?.start?.line ?? 1;
              const listenerKey = `${targetKey}:${eventTypeStr}:${handlerKey}:${line}`;
              eventListeners.set(listenerKey, { line, target: targetKey, eventType: eventTypeStr as string });
            }
          }

          // 检测 removeEventListener 调用，如果找到匹配则移除
          if (property?.name === 'removeEventListener') {
            const args = callNode.arguments;
            if (args && args.length >= 2) {
              const eventType = args[0] as Literal;
              const eventTypeStr = eventType?.type === 'Literal' ? eventType.value : 'unknown';

              // 获取目标对象标识符
              const targetObj = memberExpr.object;
              let targetKey = 'unknown';
              if (targetObj?.type === 'Identifier') {
                targetKey = (targetObj as Identifier).name;
              } else if (targetObj?.type === 'MemberExpression') {
                const nestedMember = targetObj as MemberExpression;
                if (nestedMember.object?.type === 'Identifier') {
                  targetKey = (nestedMember.object as Identifier).name;
                }
              }

              // 获取处理函数标识符
              const handler = args[1] as BaseASTNode;
              let handlerKey = 'unknown';
              if (handler?.type === 'Identifier') {
                handlerKey = (handler as Identifier).name;
              } else if (handler?.type === 'ArrowFunctionExpression' || handler?.type === 'FunctionExpression') {
                handlerKey = 'anonymous';
              }

              // 查找匹配的 addEventListener 并移除（匹配目标、事件类型和处理函数）
              for (const [key, listener] of eventListeners) {
                if (listener.target === targetKey && listener.eventType === eventTypeStr) {
                  // 如果处理函数也匹配，精确移除；否则只匹配事件类型
                  if (handlerKey !== 'unknown' && key.includes(handlerKey)) {
                    eventListeners.delete(key);
                    break;
                  } else if (handlerKey === 'unknown') {
                    // 如果处理函数未知，只匹配事件类型和目标
                  eventListeners.delete(key);
                  break;
                  }
                }
              }
            }
          }
        }
      },
      
      // 在文件结束时报告未移除的事件监听器
      'Program:exit'() {
        for (const listener of eventListeners.values()) {
          context.report({
            line: listener.line,
            category: 'performance',
            ruleId: 'performance/no-leak-event-listeners',
            severity: 'warning' as IssueSeverity,
            message: `检测到可能的事件监听器泄漏：${listener.target}.addEventListener('${listener.eventType}') 未找到对应的 removeEventListener。`,
            suggestion: '确保在组件卸载或不再需要时调用 removeEventListener，或者使用 once: true 选项。',
            fixSuggestion: {
              title: '清理事件监听器',
              description: '在组件卸载时移除事件监听器，防止内存泄漏',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '保存处理函数引用', detail: '将事件处理函数保存为变量' },
                { step: 2, action: '添加清理逻辑', detail: '在 onUnmounted 中调用 removeEventListener' },
              ],
              codeExample: {
                before: `window.addEventListener('resize', () => {
  console.log('resized');
});`,
                after: `const handleResize = () => {
  console.log('resized');
};

window.addEventListener('resize', handleResize);

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});`,
              },
              references: [
                { title: 'Vue.js Lifecycle', url: 'https://vuejs.org/guide/essentials/lifecycle.html' },
              ],
            },
          });
        }
      },
    };
  },
};
