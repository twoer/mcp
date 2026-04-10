import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, Identifier, AssignmentExpression } from '../../ast-types.js';

/**
 * 检测隐式全局变量
 *
 * 在非严格模式下，对未声明的变量赋值会创建全局变量，这可能导致：
 * 1. 全局命名空间污染
 * 2. 变量冲突
 * 3. 难以调试的问题
 * 4. 安全风险
 */

/**
 * 已知的全局变量（内置对象和浏览器 API）
 * 这些变量不需要声明即可使用
 */
const KNOWN_GLOBALS = new Set([
  // JavaScript 内置
  'undefined', 'NaN', 'Infinity',
  'Object', 'Function', 'Array', 'String', 'Boolean', 'Number', 'Symbol',
  'BigInt', 'Math', 'Date', 'RegExp', 'Error', 'AggregateError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect',
  'JSON', 'console', 'window', 'document', 'globalThis',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI',
  'encodeURIComponent', 'decodeURIComponent', 'escape', 'unescape',
  'eval', 'arguments',

  // 迭代器
  'ArrayIterator', 'StringIterator', 'MapIterator', 'SetIterator',

  // 类型化数组
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'DataView', 'ArrayBuffer', 'SharedArrayBuffer', 'Atomics',

  // Web API
  'fetch', 'Request', 'Response', 'Headers', 'URL', 'URLSearchParams',
  'FormData', 'Blob', 'File', 'FileReader', 'FileList',
  'Image', 'Audio', 'Canvas', 'WebSocket', 'Worker', 'SharedWorker',
  'Storage', 'localStorage', 'sessionStorage', 'indexedDB', 'IDBFactory',
  'History', 'Location', 'Navigator', 'Screen', 'Performance',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent',
  'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'alert', 'confirm', 'prompt', 'print', 'open', 'close',
  'getComputedStyle', 'getSelection', 'matchMedia',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'PerformanceObserver',
  'MessageChannel', 'MessagePort', 'BroadcastChannel',
  'XMLHttpRequest', 'XMLSerializer', 'DOMParser',
  'crypto', 'Crypto', 'SubtleCrypto',
  'Cache', 'caches',
  'Notification', 'ServiceWorker', 'ServiceWorkerRegistration',
  'PushManager', 'PushSubscription',

  // Node.js 全局
  'global', 'process', 'Buffer', '__dirname', '__filename', 'module', 'exports', 'require',

  // Vue 全局
  'Vue', 'createApp', 'defineComponent', 'ref', 'reactive', 'computed', 'watch', 'watchEffect',
  'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount',
  'onUpdated', 'onBeforeUpdate', 'nextTick', 'provide', 'inject',
  'defineProps', 'defineEmits', 'defineExpose', 'withDefaults',
  'useRouter', 'useRoute', 'useStore', 'useSlots', 'useAttrs',

  // 测试框架
  'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
  'jest', 'vi', 'vitest',
  'spyOn', 'mock', 'fn',

  // 其他常用库
  'React', 'ReactDOM', 'angular', 'jQuery', '$', '_', 'axios', 'dayjs', 'moment',
]);

/**
 * 变量声明类型
 */
type VarDeclKind = 'var' | 'let' | 'const' | 'function' | 'class' | 'parameter' | 'catch';

/**
 * 作用域信息
 */
interface Scope {
  parent: Scope | null;
  variables: Map<string, VarDeclKind>;
  isFunction: boolean;
}

/**
 * 创建新作用域
 */
function createScope(parent: Scope | null, isFunction: boolean = false): Scope {
  return {
    parent,
    variables: new Map(),
    isFunction,
  };
}

/**
 * 在作用域链中查找变量
 */
function findVariable(scope: Scope, name: string): VarDeclKind | undefined {
  let current: Scope | null = scope;
  while (current) {
    if (current.variables.has(name)) {
      return current.variables.get(name);
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * 检查是否在已知全局变量中
 */
function isKnownGlobal(name: string): boolean {
  // 直接匹配
  if (KNOWN_GLOBALS.has(name)) {
    return true;
  }
  // 检查常见模式：onXxx 事件处理器
  if (name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase()) {
    return true;
  }
  // 检查 Webkit/Moz 前缀
  if (name.startsWith('webkit') || name.startsWith('moz') || name.startsWith('MS')) {
    return true;
  }
  return false;
}

function reportIssue(
  context: AstRuleContext,
  line: number,
  varName: string,
): void {
  context.report({
    line,
    category: 'security',
    ruleId: 'security/no-implicit-global',
    severity: 'warning' as IssueSeverity,
    message: `变量 "${varName}" 在赋值前未声明，可能会创建隐式全局变量。`,
    suggestion: `添加变量声明（const/let/var）或在文件顶部添加 "use strict" 启用严格模式。`,
    fixSuggestion: {
      title: '添加变量声明',
      description: '未声明的变量赋值会创建隐式全局变量，可能导致命名冲突和难以调试的问题。',
      fixType: 'guided' as const,
      steps: [
        {
          step: 1,
          action: '添加变量声明',
          detail: `在变量 ${varName} 前添加 const、let 或 var 声明`,
        },
        {
          step: 2,
          action: '或启用严格模式',
          detail: '在文件顶部添加 "use strict"，严格模式会禁止隐式全局变量',
        },
      ],
      codeExample: {
        before: `${varName} = 123`,
        after: `const ${varName} = 123\n// 或在文件顶部添加\n"use strict"`,
      },
      references: [
        {
          title: 'MDN - 严格模式',
          url: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Strict_mode',
        },
        {
          title: 'MDN - var/let/const',
          url: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/const',
        },
      ],
    },
  });
}

export const noImplicitGlobalRule: RuleDefinition<AstRuleContext> = {
  id: 'security/no-implicit-global',
  create(context: AstRuleContext) {
    const scopeStack: Scope[] = [createScope(null, true)];

    /**
     * 获取当前作用域
     */
    function currentScope(): Scope {
      return scopeStack[scopeStack.length - 1];
    }

    /**
     * 在当前作用域声明变量
     */
    function declareVariable(name: string, kind: VarDeclKind): void {
      currentScope().variables.set(name, kind);
    }

    return {
      // 变量声明
      VariableDeclarator(node: BaseASTNode) {
        const decl = node as BaseASTNode & {
          id?: BaseASTNode;
          parent?: BaseASTNode & { kind?: string };
        };
        if (decl.id?.type === 'Identifier') {
          const kind = (decl.parent?.kind as VarDeclKind) || 'var';
          declareVariable((decl.id as Identifier).name, kind);
        } else if (decl.id?.type === 'ObjectPattern' || decl.id?.type === 'ArrayPattern') {
          // 解构声明，简化处理，标记为 var
          // 实际实现需要遍历解构模式提取所有变量名
          const pattern = decl.id as BaseASTNode & { properties?: BaseASTNode[]; elements?: BaseASTNode[] };
          if (pattern.properties) {
            for (const prop of pattern.properties) {
              if (prop.type === 'Property' && (prop as BaseASTNode & { value?: BaseASTNode }).value?.type === 'Identifier') {
                declareVariable(((prop as BaseASTNode & { value: Identifier }).value).name, 'var');
              } else if (prop.type === 'RestElement' && (prop as BaseASTNode & { argument?: BaseASTNode }).argument?.type === 'Identifier') {
                declareVariable(((prop as BaseASTNode & { argument: Identifier }).argument).name, 'var');
              }
            }
          }
          if (pattern.elements) {
            for (const elem of pattern.elements) {
              if (elem?.type === 'Identifier') {
                declareVariable((elem as Identifier).name, 'var');
              }
            }
          }
        }
      },

      // 函数声明
      FunctionDeclaration(node: BaseASTNode) {
        const func = node as BaseASTNode & { id?: Identifier };
        if (func.id) {
          declareVariable(func.id.name, 'function');
        }
        // 进入函数作用域
        scopeStack.push(createScope(currentScope(), true));
      },

      // 类声明
      ClassDeclaration(node: BaseASTNode) {
        const cls = node as BaseASTNode & { id?: Identifier };
        if (cls.id) {
          declareVariable(cls.id.name, 'class');
        }
      },

      // 函数表达式和箭头函数
      FunctionExpression(node: BaseASTNode) {
        const func = node as BaseASTNode & { id?: Identifier };
        if (func.id) {
          // 命名函数表达式，名称只在函数内部可见
        }
        scopeStack.push(createScope(currentScope(), true));
      },

      ArrowFunctionExpression(node: BaseASTNode) {
        scopeStack.push(createScope(currentScope(), true));
      },

      // 函数参数
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node: BaseASTNode) {
        const func = node as BaseASTNode & { params?: BaseASTNode[] };
        if (func.params) {
          for (const param of func.params) {
            if (param.type === 'Identifier') {
              declareVariable((param as Identifier).name, 'parameter');
            } else if (param.type === 'AssignmentPattern' && (param as BaseASTNode & { left?: BaseASTNode }).left?.type === 'Identifier') {
              declareVariable(((param as BaseASTNode & { left: Identifier }).left).name, 'parameter');
            } else if (param.type === 'RestElement' && (param as BaseASTNode & { argument?: BaseASTNode }).argument?.type === 'Identifier') {
              declareVariable(((param as BaseASTNode & { argument: Identifier }).argument).name, 'parameter');
            }
          }
        }
      },

      // 退出函数作用域
      'FunctionDeclaration:exit'() {
        scopeStack.pop();
      },

      'FunctionExpression:exit'() {
        scopeStack.pop();
      },

      'ArrowFunctionExpression:exit'() {
        scopeStack.pop();
      },

      // catch 子句参数
      CatchClause(node: BaseASTNode) {
        const catchClause = node as BaseASTNode & { param?: BaseASTNode };
        if (catchClause.param?.type === 'Identifier') {
          declareVariable((catchClause.param as Identifier).name, 'catch');
        }
        scopeStack.push(createScope(currentScope(), false));
      },

      'CatchClause:exit'() {
        scopeStack.pop();
      },

      // 块级作用域（简化处理，不完整）
      BlockStatement(node: BaseASTNode) {
        // 不创建新作用域，因为 let/const 声明已在 VariableDeclarator 中处理
      },

      // 检查赋值表达式
      AssignmentExpression(node: BaseASTNode) {
        const assignment = node as AssignmentExpression;
        const left = assignment.left;

        if (left.type === 'Identifier') {
          const name = (left as Identifier).name;

          // 检查是否已声明或是已知全局
          const declared = findVariable(currentScope(), name);
          if (!declared && !isKnownGlobal(name)) {
            const line = node.loc?.start?.line ?? 1;
            reportIssue(context, line, name);
          }
        }
      },

      // 检查更新表达式（未声明变量的自增/自减）
      UpdateExpression(node: BaseASTNode) {
        const update = node as BaseASTNode & {
          argument?: BaseASTNode;
          operator?: string;
        };
        const arg = update.argument;

        if (arg?.type === 'Identifier') {
          const name = (arg as Identifier).name;
          const declared = findVariable(currentScope(), name);
          if (!declared && !isKnownGlobal(name)) {
            const line = node.loc?.start?.line ?? 1;
            reportIssue(context, line, name);
          }
        }
      },
    };
  },
};
