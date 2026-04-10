import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, CallExpression, Identifier } from '../../ast-types.js';

/**
 * 检测 Vue 组件中未清理的定时器 (setTimeout/setInterval)
 *
 * 未清理的定时器会导致：
 * 1. 内存泄漏
 * 2. 组件销毁后仍执行代码，导致报错
 * 3. 意外的副作用
 *
 * 此规则检测：
 * - setTimeout/setInterval 赋值给变量，但未在 onUnmounted/onBeforeUnmount 中清理
 */

/**
 * 定时器函数
 */
const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval']);

/**
 * 清理函数映射
 */
const CLEAR_FUNCTIONS: Record<string, string> = {
  setTimeout: 'clearTimeout',
  setInterval: 'clearInterval',
};

/**
 * 生命周期清理钩子 (Composition API)
 */
const COMPOSITION_CLEANUP_HOOKS = new Set(['onUnmounted', 'onBeforeUnmount']);

/**
 * 生命周期清理钩子 (Options API)
 */
const OPTIONS_CLEANUP_HOOKS = new Set(['beforeUnmount', 'unmounted']);

/**
 * 收集所有定时器调用
 */
function collectTimerCalls(root: BaseASTNode): Map<string, { line: number; type: string }> {
  const timers = new Map<string, { line: number; type: string }>();

  function traverse(node: BaseASTNode | null | undefined): void {
    if (!node || typeof node !== 'object') return;

    // 检查 setTimeout/setInterval 调用
    if (node.type === 'VariableDeclarator') {
      const declarator = node as BaseASTNode & {
        id?: BaseASTNode;
        init?: BaseASTNode;
      };

      const init = declarator.init;
      if (init?.type === 'CallExpression') {
        const call = init as CallExpression;
        if (call.callee.type === 'Identifier') {
          const name = (call.callee as Identifier).name;
          if (TIMER_FUNCTIONS.has(name)) {
            // 获取变量名
            if (declarator.id?.type === 'Identifier') {
              const varName = (declarator.id as Identifier).name;
              timers.set(varName, {
                line: node.loc?.start?.line ?? 1,
                type: name,
              });
            }
          }
        }
      }
    }

    // 检查 this.timer = setTimeout(...) 形式
    if (node.type === 'AssignmentExpression') {
      const assignment = node as BaseASTNode & {
        left?: BaseASTNode;
        right?: BaseASTNode;
      };

      const right = assignment.right;
      if (right?.type === 'CallExpression') {
        const call = right as CallExpression;
        if (call.callee.type === 'Identifier') {
          const name = (call.callee as Identifier).name;
          if (TIMER_FUNCTIONS.has(name)) {
            // 获取 this.xxx 形式的变量名
            const left = assignment.left;
            if (left?.type === 'MemberExpression') {
              const memberExpr = left as BaseASTNode & {
                property?: BaseASTNode;
                object?: BaseASTNode;
              };
              if (memberExpr.property?.type === 'Identifier') {
                const varName = (memberExpr.property as Identifier).name;
                timers.set(`this.${varName}`, {
                  line: node.loc?.start?.line ?? 1,
                  type: name,
                });
              }
            }
          }
        }
      }
    }

    // 递归遍历子节点
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        value.forEach((item) => traverse(item as BaseASTNode));
      } else if (typeof value === 'object' && value !== null) {
        traverse(value as BaseASTNode);
      }
    }
  }

  traverse(root);
  return timers;
}

/**
 * 收集所有清理调用
 */
function collectCleanupCalls(root: BaseASTNode): Set<string> {
  const cleared = new Set<string>();

  function traverse(node: BaseASTNode | null | undefined): void {
    if (!node || typeof node !== 'object') return;

    // 检查 clearTimeout/clearInterval 调用
    if (node.type === 'CallExpression') {
      const call = node as CallExpression;
      if (call.callee.type === 'Identifier') {
        const name = (call.callee as Identifier).name;
        if (name === 'clearTimeout' || name === 'clearInterval') {
          // 获取被清理的变量名
          if (call.arguments.length > 0) {
            const arg = call.arguments[0];
            if (arg.type === 'Identifier') {
              cleared.add((arg as Identifier).name);
            } else if (arg.type === 'MemberExpression') {
              const memberExpr = arg as BaseASTNode & {
                property?: BaseASTNode;
                object?: BaseASTNode;
              };
              if (memberExpr.property?.type === 'Identifier' && memberExpr.object?.type === 'ThisExpression') {
                cleared.add(`this.${(memberExpr.property as Identifier).name}`);
              }
            }
          }
        }
      }
    }

    // 递归遍历子节点
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        value.forEach((item) => traverse(item as BaseASTNode));
      } else if (typeof value === 'object' && value !== null) {
        traverse(value as BaseASTNode);
      }
    }
  }

  traverse(root);
  return cleared;
}

/**
 * 检查是否有生命周期清理钩子
 */
function hasCleanupHook(root: BaseASTNode): boolean {
  let hasHook = false;

  function traverse(node: BaseASTNode | null | undefined): void {
    if (!node || typeof node !== 'object') return;

    // Composition API: onUnmounted(() => { ... }), onBeforeUnmount(() => { ... })
    if (node.type === 'CallExpression') {
      const call = node as CallExpression;
      if (call.callee.type === 'Identifier') {
        const name = (call.callee as Identifier).name;
        if (COMPOSITION_CLEANUP_HOOKS.has(name)) {
          hasHook = true;
          return;
        }
      }
    }

    // Options API: beforeUnmount() { ... }, unmounted() { ... }
    if (node.type === 'Property') {
      const prop = node as BaseASTNode & {
        key?: BaseASTNode;
        method?: boolean;
      };
      if (prop.key?.type === 'Identifier') {
        const name = (prop.key as Identifier).name;
        if (OPTIONS_CLEANUP_HOOKS.has(name)) {
          hasHook = true;
          return;
        }
      }
    }

    // 递归遍历子节点
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        value.forEach((item) => traverse(item as BaseASTNode));
      } else if (typeof value === 'object' && value !== null) {
        traverse(value as BaseASTNode);
      }
    }
  }

  traverse(root);
  return hasHook;
}

export const vueNoTimerWithoutCleanupRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-no-timer-without-cleanup',
  create(context: AstRuleContext) {
    return {
      Program(node: BaseASTNode) {
        // 收集所有定时器
        const timers = collectTimerCalls(node);

        // 如果没有定时器，直接返回
        if (timers.size === 0) return;

        // 检查是否有清理钩子
        const hasHook = hasCleanupHook(node);

        // 如果有清理钩子，检查是否清理了所有定时器
        if (hasHook) {
          const cleared = collectCleanupCalls(node);

          // 检查未清理的定时器
          for (const [varName, info] of timers) {
            if (!cleared.has(varName)) {
              context.report({
                line: info.line,
                category: 'vue',
                ruleId: 'framework/vue-no-timer-without-cleanup',
                severity: 'warning' as IssueSeverity,
                message: `定时器 ${varName} (${info.type}) 未在 onUnmounted/onBeforeUnmount 中清理，可能导致内存泄漏。`,
                suggestion: `在 onUnmounted 或 onBeforeUnmount 中调用 ${CLEAR_FUNCTIONS[info.type]}(${varName}) 清理定时器。`,
                fixSuggestion: {
                  title: '在 onUnmounted 中清理定时器',
                  description: '在组件卸载时清理定时器，防止内存泄漏',
                  fixType: 'guided' as const,
                  steps: [
                    { step: 1, action: '导入生命周期钩子', detail: '从 vue 导入 onUnmounted 或 onBeforeUnmount' },
                    { step: 2, action: '添加清理逻辑', detail: `在钩子中调用 ${CLEAR_FUNCTIONS[info.type]}` },
                  ],
                  codeExample: {
                    before: `const timer = setTimeout(() => {
  console.log('Hello');
}, 1000);`,
                    after: `const timer = setTimeout(() => {
  console.log('Hello');
}, 1000);

onUnmounted(() => {
  clearTimeout(timer);
});`,
                  },
                  references: [
                    { title: 'Vue.js Lifecycle Hooks', url: 'https://vuejs.org/guide/essentials/lifecycle.html' },
                  ],
                },
              });
            }
          }
        } else {
          // 没有清理钩子，报告所有定时器
          for (const [varName, info] of timers) {
            context.report({
              line: info.line,
              category: 'vue',
              ruleId: 'framework/vue-no-timer-without-cleanup',
              severity: 'warning' as IssueSeverity,
              message: `定时器 ${varName} (${info.type}) 未清理，组件缺少 onUnmounted/onBeforeUnmount 钩子。`,
              suggestion: `添加 onUnmounted(() => { ${CLEAR_FUNCTIONS[info.type]}(${varName}); }) 来清理定时器。`,
            });
          }
        }
      },
    };
  },
};
