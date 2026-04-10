import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, CallExpression } from '../../ast-types.js';

/**
 * 常见的大型库列表
 * 这些库通常应该按需导入而非整体导入
 */
const LARGE_LIBRARIES = [
  'lodash',
  'moment',
  'antd',
  'element-ui',
  'echarts',
  '@ant-design/icons',
  '@material-ui/icons',
  '@fortawesome/fontawesome',
  'rxjs',
  'rxjs/operators',
];

/**
 * 检测大型库的整体导入
 * 整体导入会增加打包体积，应该按需导入
 */
export const noLargeBundleImportRule: RuleDefinition<AstRuleContext> = {
  id: 'performance/no-large-bundle-import',
  create(context: AstRuleContext) {
    const allowList = (context.ruleOptions?.allowList as string[] | undefined) ?? [];

    return {
      ImportDeclaration(node: BaseASTNode) {
        const importNode = node as BaseASTNode & {
          source?: { value?: unknown };
          specifiers?: Array<BaseASTNode & { type: string }>;
        };
        const source = importNode.source?.value;
        if (!source || typeof source !== 'string') return;

        // 检查是否在允许列表中
        if (allowList.includes(source)) return;

        // 检查是否是大型库的导入
        for (const lib of LARGE_LIBRARIES) {
          if (source === lib || source.startsWith(lib + '/')) {
            // 检查是否使用了通配符导入
            const specifiers = importNode.specifiers || [];
            const hasNamespaceImport = specifiers.some(
              (spec) => spec.type === 'ImportNamespaceSpecifier'
            );

            const line = node.loc?.start?.line ?? 1;

            if (hasNamespaceImport) {
              context.report({
                line,
                category: 'performance',
                ruleId: 'performance/no-large-bundle-import',
                severity: 'warning' as IssueSeverity,
                message: `检测到大型库的整体导入：${source}。这会显著增加打包体积。`,
                suggestion: `考虑按需导入，例如使用 import { func1, func2 } from '${lib}' 或 tree-shaking 优化。`,
                fixSuggestion: {
                  title: '使用按需导入',
                  description: '只导入需要的模块，减少打包体积',
                  fixType: 'guided' as const,
                  steps: [
                    { step: 1, action: '识别使用的功能', detail: '确定代码中实际使用了哪些功能' },
                    { step: 2, action: '改为具名导入', detail: '使用 import { ... } 语法按需导入' },
                    { step: 3, action: '配置 tree-shaking', detail: '确保构建工具支持 tree-shaking' },
                  ],
                  codeExample: {
                    before: `import * as _ from 'lodash';
const result = _.debounce(fn, 300);`,
                    after: `import { debounce } from 'lodash-es';
const result = debounce(fn, 300);`,
                  },
                  references: [
                    { title: 'Tree Shaking', url: 'https://webpack.js.org/guides/tree-shaking/' },
                  ],
                },
              });
            } else if (specifiers.length > 10) {
              // 如果导入的项目超过10个，也提示警告
              context.report({
                line,
                category: 'performance',
                ruleId: 'performance/no-large-bundle-import',
                severity: 'info' as IssueSeverity,
                message: `从 ${source} 导入了 ${specifiers.length} 个项目，考虑是否需要全部导入。`,
                suggestion: '检查是否所有导入的项都在使用，考虑按需导入或动态导入。',
              });
            }
            break;
          }
        }
      },
    };
  },
};
