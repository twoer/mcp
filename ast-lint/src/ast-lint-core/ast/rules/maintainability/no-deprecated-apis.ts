import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  Identifier,
  CallExpression,
  MemberExpression,
} from '../../ast-types.js';

/**
 * 废弃 API 定义
 */
interface DeprecatedAPI {
  name: string;
  version: string;
  replacement: string;
  category: 'javascript' | 'node' | 'browser' | 'vue';
  message: string;
}

/**
 * 废弃 API 列表
 */
const DEPRECATED_APIS: DeprecatedAPI[] = [
  // JavaScript 废弃
  {
    name: 'escape',
    version: 'ES5',
    replacement: 'encodeURI()',
    category: 'javascript',
    message: 'escape() 已废弃，请使用 encodeURI() 或 encodeURIComponent() 代替',
  },
  {
    name: 'unescape',
    version: 'ES5',
    replacement: 'decodeURI()',
    category: 'javascript',
    message: 'unescape() 已废弃，请使用 decodeURI() 或 decodeURIComponent() 代替',
  },
  {
    name: 'getYear',
    version: 'ES5',
    replacement: 'getFullYear()',
    category: 'javascript',
    message: 'getYear() 已废弃，请使用 getFullYear() 代替',
  },
  {
    name: 'toGMTString',
    version: 'ES5',
    replacement: 'toUTCString()',
    category: 'javascript',
    message: 'toGMTString() 已废弃，请使用 toUTCString() 代替',
  },
  {
    name: 'substr',
    version: 'ES2019',
    replacement: 'substring() 或 slice()',
    category: 'javascript',
    message: 'substr() 已废弃，请使用 substring() 或 slice() 代替',
  },
  
  // Node.js 废弃
  {
    name: 'Buffer',
    version: 'Node.js 6.0.0',
    replacement: 'Buffer.from()',
    category: 'node',
    message: 'new Buffer() 已废弃，请使用 Buffer.from() 或 Buffer.alloc() 代替',
  },
  {
    name: 'isBuffer',
    version: 'Node.js 10.0.0',
    replacement: 'Buffer.isBuffer()',
    category: 'node',
    message: 'util.isBuffer() 已废弃，请使用 Buffer.isBuffer() 代替',
  },
  {
    name: 'exists',
    version: 'Node.js 0.12.0',
    replacement: 'fs.stat() 或 fs.access()',
    category: 'node',
    message: 'fs.exists() 已废弃，请使用 fs.stat() 或 fs.access() 代替',
  },
  
  // Vue 2 → Vue 3 废弃
  {
    name: 'Vue',
    version: 'Vue 3',
    replacement: 'createApp()',
    category: 'vue',
    message: 'new Vue() 已废弃，请使用 createApp() 代替（Vue 3）',
  },
  {
    name: '$mount',
    version: 'Vue 3',
    replacement: 'mount()',
    category: 'vue',
    message: 'app.$mount() 已废弃，请使用 app.mount() 代替（Vue 3）',
  },
  {
    name: '$destroy',
    version: 'Vue 3',
    replacement: 'unmount()',
    category: 'vue',
    message: 'app.$destroy() 已废弃，请使用 app.unmount() 代替（Vue 3）',
  },
  {
    name: '$set',
    version: 'Vue 3',
    replacement: '响应式系统',
    category: 'vue',
    message: 'app.$set() 已废弃，请使用 Vue 3 响应式系统代替',
  },
  {
    name: '$delete',
    version: 'Vue 3',
    replacement: '响应式系统',
    category: 'vue',
    message: 'app.$delete() 已废弃，请使用 Vue 3 响应式系统代替',
  },
];

/**
 * 检查注释中是否包含允许使用废弃 API 的说明
 */
function hasAllowComment(node: BaseASTNode): boolean {
  // 检查节点前面的注释
  const leadingComments = (node as any).leadingComments as any[];
  if (!leadingComments || leadingComments.length === 0) {
    return false;
  }

  const commentText = leadingComments.map((c) => c.value).join(' ').toLowerCase();
  const allowKeywords = ['兼容', 'compatibility', 'deprecated', '废弃', 'legacy', 'ie', 'safari', '旧版本'];
  
  return allowKeywords.some((keyword) => commentText.includes(keyword));
}

/**
 * 检查是否是特定的 Vue 废弃 API
 */
function isVueDeprecatedCall(callExpr: CallExpression): DeprecatedAPI | undefined {
  const callee = callExpr.callee;
  if (!callee || callee.type !== 'MemberExpression') {
    return undefined;
  }

  const memberExpr = callee as MemberExpression;
  if (memberExpr.object.type !== 'Identifier' || memberExpr.property.type !== 'Identifier') {
    return undefined;
  }

  const obj = (memberExpr.object as Identifier).name;
  const prop = (memberExpr.property as Identifier).name;

  // 检查 Vue 应用实例上的废弃方法
  if (obj === 'app' || obj === 'this') {
    return DEPRECATED_APIS.find((api) => api.category === 'vue' && api.name === prop);
  }

  return undefined;
}

/**
 * 检测废弃 API 的规则
 */
export const noDeprecatedApisRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/no-deprecated-apis',
  create(context: AstRuleContext) {
    return {
      CallExpression(node: BaseASTNode) {
        const callExpr = node as CallExpression;

        // 首先检查是否是 Vue 废弃 API
        const vueDeprecated = isVueDeprecatedCall(callExpr);
        if (vueDeprecated) {
          if (hasAllowComment(node)) {
            return;
          }

          const line = node.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/no-deprecated-apis',
            severity: 'error' as IssueSeverity,
            message: vueDeprecated.message,
            suggestion: `请使用 ${vueDeprecated.replacement} 代替（${vueDeprecated.version} 起）`,
            fixSuggestion: {
              title: '替换废弃的 API',
              description: '使用新的 API 替换已废弃的方法',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '查找替代 API', detail: `使用 ${vueDeprecated.replacement} 替代` },
                { step: 2, action: '更新代码', detail: '修改所有使用废弃 API 的地方' },
                { step: 3, action: '测试功能', detail: '确保替换后功能正常' },
              ],
              references: [
                { title: 'Vue.js Migration Guide', url: 'https://v3-migration.vuejs.org/' },
              ],
            },
          });
          return;
        }

        // 检查函数调用
        const callee = callExpr.callee;
        let identifier: string | null = null;

        if (callee?.type === 'Identifier') {
          identifier = (callee as Identifier).name;
        } else if (callee?.type === 'MemberExpression') {
          const memberExpr = callee as MemberExpression;
          if (memberExpr.property?.type === 'Identifier') {
            identifier = (memberExpr.property as Identifier).name;
          }
        }

        if (!identifier) {
          return;
        }

        // 检查是否是废弃 API
        const deprecatedAPI = DEPRECATED_APIS.find((api) => api.name === identifier);
        if (deprecatedAPI) {
          if (hasAllowComment(node)) {
            return;
          }

          const line = node.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/no-deprecated-apis',
            severity: 'error' as IssueSeverity,
            message: deprecatedAPI.message,
            suggestion: `请使用 ${deprecatedAPI.replacement} 代替（${deprecatedAPI.version} 起）`,
          });
        }
      },

      MemberExpression(node: BaseASTNode) {
        const memberExpr = node as MemberExpression;

        // 检查是否直接访问废弃属性
        if (memberExpr.object?.type === 'Identifier' && memberExpr.property?.type === 'Identifier') {
          const objName = (memberExpr.object as Identifier).name;
          const propName = (memberExpr.property as Identifier).name;

          // 检查 Date.prototype.getYear() 等属性访问
          if (objName === 'date' && propName === 'getYear') {
            if (hasAllowComment(node)) {
              return;
            }

            const line = node.loc?.start?.line ?? 1;
            context.report({
              line,
              category: 'maintainability',
              ruleId: 'maintainability/no-deprecated-apis',
              severity: 'error' as IssueSeverity,
              message: 'getYear() 已废弃，请使用 getFullYear() 代替',
              suggestion: '请使用 getFullYear() 代替（ES5 起）',
            });
          }
        }
      },
    };
  },
};
