import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, CallExpression, Identifier, Property } from '../../ast-types.js';

/**
 * 检测 Vue computed 属性中的异步操作
 *
 * computed 属性应该是纯同步函数，异步操作会导致：
 * 1. 返回 Promise 而不是预期值
 * 2. 响应性丢失
 * 3. 难以调试的问题
 */

/**
 * 异步操作标识符
 */
const ASYNC_IDENTIFIERS = new Set([
  'fetch',
  'axios',
  'http',
  'request',
  'get',
  'post',
  'put',
  'delete',
  'patch',
  '$http',
  '$axios',
  '$fetch',
  'useFetch',
  'useAsyncData',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'requestIdleCallback',
]);

/**
 * 检查调用是否是异步操作
 */
function isAsyncCall(node: BaseASTNode): boolean {
  if (node.type !== 'CallExpression') return false;

  const call = node as CallExpression;
  const callee = call.callee;

  // 直接调用: fetch(), axios()
  if (callee.type === 'Identifier') {
    const name = (callee as Identifier).name;
    if (ASYNC_IDENTIFIERS.has(name)) {
      return true;
    }
  }

  // 成员调用: axios.get(), http.post(), this.$http()
  if (callee.type === 'MemberExpression') {
    const memberExpr = callee as BaseASTNode & {
      property?: BaseASTNode;
      object?: BaseASTNode;
    };

    const property = memberExpr.property;
    if (property?.type === 'Identifier') {
      const propName = (property as Identifier).name;

      // 检查方法名
      if (ASYNC_IDENTIFIERS.has(propName)) {
        return true;
      }

      // 检查以 .then, .catch, .finally 结尾的链式调用
      if (['then', 'catch', 'finally'].includes(propName)) {
        return true;
      }
    }

    // 检查对象名: axios.xxx, http.xxx
    const object = memberExpr.object;
    if (object?.type === 'Identifier') {
      const objName = (object as Identifier).name;
      if (ASYNC_IDENTIFIERS.has(objName)) {
        return true;
      }
    }
    if (object?.type === 'ThisExpression') {
      // this.$http, this.$axios 等
      return true;
    }
  }

  return false;
}

/**
 * 检查函数是否是 async 函数
 */
function isAsyncFunction(node: BaseASTNode): boolean {
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    const func = node as BaseASTNode & { async?: boolean };
    return func.async === true;
  }
  return false;
}

/**
 * 在节点树中查找异步操作
 */
function findAsyncOperations(root: BaseASTNode | null): Array<{ line: number; type: string }> {
  const results: Array<{ line: number; type: string }> = [];

  function traverse(node: BaseASTNode | null | undefined): void {
    if (!node || typeof node !== 'object') return;

    // 检查 await 表达式
    if (node.type === 'AwaitExpression') {
      results.push({
        line: node.loc?.start?.line ?? 1,
        type: 'await',
      });
    }

    // 检查异步函数调用
    if (isAsyncCall(node)) {
      results.push({
        line: node.loc?.start?.line ?? 1,
        type: 'async call',
      });
    }

    // 检查返回 new Promise
    if (node.type === 'ReturnStatement') {
      const returnStmt = node as BaseASTNode & { argument?: BaseASTNode };
      if (returnStmt.argument?.type === 'NewExpression') {
        const newExpr = returnStmt.argument as BaseASTNode & { callee?: BaseASTNode };
        if (newExpr.callee?.type === 'Identifier') {
          const calleeId = newExpr.callee as Identifier;
          if (calleeId.name === 'Promise') {
            results.push({
              line: node.loc?.start?.line ?? 1,
              type: 'Promise',
            });
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
  return results;
}

function reportIssue(
  context: AstRuleContext,
  line: number,
  propName: string | undefined,
  asyncType: string,
): void {
  const propText = propName ? `"${propName}"` : '';
  context.report({
    line,
    category: 'vue',
    ruleId: 'framework/vue-no-async-in-computed',
    severity: 'error' as IssueSeverity,
    message: `computed 属性 ${propText} 中包含异步操作 (${asyncType})，computed 必须是纯同步函数。`,
    suggestion: `将异步逻辑移到 watch、watchEffect 或方法中，使用 ref/reactive 存储异步结果。`,
    fixSuggestion: {
      title: '将异步逻辑移到 watch 或 method',
      description: 'computed 属性必须是同步的，异步操作应该在 watch、watchEffect 或方法中执行',
      fixType: 'guided' as const,
      steps: [
        { step: 1, action: '创建响应式变量', detail: '使用 ref 或 reactive 创建变量存储异步结果' },
        { step: 2, action: '移动异步逻辑', detail: '将异步操作移到 watch、watchEffect 或方法中' },
        { step: 3, action: '更新 computed', detail: '让 computed 返回响应式变量的值' },
      ],
      codeExample: {
        before: `const fullName = computed(async () => {
  const data = await fetchUser();
  return data.name;
});`,
        after: `const userData = ref(null);
const fullName = computed(() => userData.value?.name || '');

watch(() => userId.value, async (id) => {
  userData.value = await fetchUser(id);
}, { immediate: true });`,
      },
      references: [
        { title: 'Vue.js Computed Properties', url: 'https://vuejs.org/guide/essentials/computed.html' },
        { title: 'Vue.js Watchers', url: 'https://vuejs.org/guide/essentials/watchers.html' },
      ],
    },
  });
}

/**
 * 检查属性是否在 computed 对象内
 */
function isInComputedObject(node: BaseASTNode): { inComputed: boolean; propName?: string } {
  let current: BaseASTNode | undefined = node;
  let propName: string | undefined;

  // 获取属性名
  if (node.type === 'Property') {
    const prop = node as Property;
    if (prop.key.type === 'Identifier') {
      propName = (prop.key as Identifier).name;
    }
  }

  // 向上遍历查找 computed 对象
  while (current) {
    if (current.type === 'ObjectExpression') {
      const parent = (current as BaseASTNode & { parent?: BaseASTNode }).parent;
      if (parent?.type === 'Property') {
        const parentProp = parent as Property;
        if (parentProp.key.type === 'Identifier' &&
            (parentProp.key as Identifier).name === 'computed') {
          return { inComputed: true, propName };
        }
      }
    }
    current = (current as BaseASTNode & { parent?: BaseASTNode }).parent;
  }

  return { inComputed: false };
}

export const vueNoAsyncInComputedRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-no-async-in-computed',
  create(context: AstRuleContext) {
    return {
      // 检测 Options API 中的 computed
      Property(node: BaseASTNode) {
        const { inComputed, propName } = isInComputedObject(node);
        if (!inComputed) return;

        const prop = node as Property;
        const value = prop.value;

        // 获取函数体
        let functionBody: BaseASTNode | null = null;

        // computed: { foo() { ... } }
        if (value.type === 'FunctionExpression') {
          functionBody = value.body as BaseASTNode;
          // 检查是否是 async 函数
          if (isAsyncFunction(value)) {
            const line = node.loc?.start?.line ?? 1;
            reportIssue(context, line, propName, 'async function');
            return;
          }
        }
        // computed: { foo: { get() { ... }, set() { ... } } }
        else if ((value as BaseASTNode).type === 'ObjectExpression') {
          const objExpr = value as BaseASTNode & { properties?: BaseASTNode[] };
          if (objExpr.properties) {
            for (const p of objExpr.properties) {
              if (p.type === 'Property') {
                const pProp = p as Property;
                const pKey = pProp.key;
                if (pKey.type === 'Identifier' && (pKey.name === 'get' || pKey.name === 'set')) {
                  const pValue = pProp.value;
                  if (pValue.type === 'FunctionExpression') {
                    functionBody = pValue.body as BaseASTNode;
                    if (isAsyncFunction(pValue)) {
                      const line = p.loc?.start?.line ?? 1;
                      reportIssue(context, line, propName, 'async function');
                      return;
                    }
                    // 检查函数体中的异步调用
                    const asyncOps = findAsyncOperations(functionBody);
                    if (asyncOps.length > 0) {
                      reportIssue(context, asyncOps[0].line, propName, asyncOps[0].type);
                      return;
                    }
                  }
                }
              }
            }
          }
          return;
        }

        if (!functionBody) return;

        // 检查函数体中的异步调用
        const asyncOps = findAsyncOperations(functionBody);
        if (asyncOps.length > 0) {
          reportIssue(context, asyncOps[0].line, propName, asyncOps[0].type);
        }
      },

      // 检测 Composition API 中的 computed
      CallExpression(node: BaseASTNode) {
        const call = node as CallExpression;
        const callee = call.callee;

        // 检查是否是 computed() 调用
        if (callee.type !== 'Identifier' || (callee as Identifier).name !== 'computed') {
          return;
        }

        // 检查参数
        const args = call.arguments;
        if (args.length === 0) return;

        const firstArg = args[0];

        // computed(() => { ... })
        if (firstArg.type === 'ArrowFunctionExpression' || firstArg.type === 'FunctionExpression') {
          // 检查是否是 async 函数
          if (isAsyncFunction(firstArg)) {
            const line = node.loc?.start?.line ?? 1;
            reportIssue(context, line, undefined, 'async function');
            return;
          }

          // 检查函数体中的异步调用
          const functionBody = firstArg.body as BaseASTNode;
          const asyncOps = findAsyncOperations(functionBody);
          if (asyncOps.length > 0) {
            reportIssue(context, asyncOps[0].line, undefined, asyncOps[0].type);
          }
        }
      },
    };
  },
};
