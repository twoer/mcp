import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode } from '../../ast-types.js';

// PostCSS 类型定义（简化版）
interface PostCSSModule {
  default?: unknown;
  [key: string]: unknown;
}

interface PostCSSDeclaration {
  prop: string;
  value: string;
  source?: {
    start?: {
      line?: number;
    };
  };
}

interface PostCSSRoot {
  walkDecls(callback: (decl: PostCSSDeclaration) => void): void;
}

interface PostCSSResult {
  root: PostCSSRoot;
}

// PostCSS 依赖的动态导入缓存
let postcss: PostCSSModule | undefined = undefined;
let postcssScss: PostCSSModule | undefined = undefined;
let postcssLess: PostCSSModule | undefined = undefined;

async function safeImport(moduleName: string): Promise<PostCSSModule | undefined> {
  try {
    return await import(moduleName) as PostCSSModule;
  } catch {
    return undefined;
  }
}

async function loadPostCSS() {
  if (postcss === undefined) {
    postcss = await safeImport('postcss');
  }
  if (postcssScss === undefined) {
    postcssScss = await safeImport('postcss-scss');
  }
  if (postcssLess === undefined) {
    postcssLess = await safeImport('postcss-less');
  }
}

function getParser(extension: string) {
  switch (extension) {
    case 'scss':
      return postcssScss;
    case 'less':
      return postcssLess;
    default:
      return undefined;
  }
}

interface NoLargeZIndexOptions {
  /** 最大允许的 z-index 值 */
  max?: number;
}

/**
 * 禁止使用过大的 z-index 值
 *
 * 问题：
 * - 过大的 z-index（如 9999, 999999）难以维护
 * - 容易导致 z-index 竞赛，不断增加值来覆盖其他元素
 * - 破坏层级系统的可预测性
 *
 * 正确示例：
 * ```css
 * .modal { z-index: 100; }
 * .tooltip { z-index: 200; }
 * .dropdown { z-index: 50; }
 * ```
 *
 * 错误示例：
 * ```css
 * .modal { z-index: 9999; }
 * .tooltip { z-index: 999999; }
 * ```
 */
export const noLargeZIndexRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/no-large-z-index',
  create(context: AstRuleContext) {
    const options = (context.ruleOptions || {}) as NoLargeZIndexOptions;
    const maxZIndex = options.max ?? 1000;

    return {
      async 'Program:exit'(node: BaseASTNode) {
        const filePath = context.filePath;
        const extension = filePath.split('.').pop()?.toLowerCase() || '';

        // 仅处理 CSS/SCSS/LESS/Vue 文件
        if (!['css', 'scss', 'less', 'sass', 'vue'].includes(extension)) {
          return;
        }

        // 动态加载 PostCSS
        await loadPostCSS();

        // 如果没有 postcss，静默跳过
        if (!postcss || (extension !== 'css' && !postcssScss && !postcssLess)) {
          return;
        }

        // 读取文件内容
        const projectRoot = process.cwd();
        let fullPath = filePath;

        if (!filePath.startsWith('/') && !filePath.startsWith('.')) {
          fullPath = projectRoot + '/' + filePath;
        }

        let content: string;
        try {
          const fs = await import('node:fs/promises');
          content = await fs.readFile(fullPath, 'utf8');
        } catch {
          return;
        }

        let styleContent = content;
        let styleExtension = extension;

        // 如果是 Vue 文件，提取 <style> 标签内容
        if (extension === 'vue') {
          const styleMatch = content.match(/<style(\s+[^>]*)?>([\s\S]*?)<\/style>/i);
          if (!styleMatch) {
            return;
          }

          const langMatch = styleMatch[1]?.match(/lang=["']([^"']+)["']/i);
          const lang = langMatch ? langMatch[1].toLowerCase() : 'css';

          styleExtension = lang === 'scss' ? 'scss' : lang === 'less' ? 'less' : lang === 'sass' ? 'sass' : 'css';
          styleContent = styleMatch[2];
        }

        const parser = getParser(styleExtension);
        const plugins: unknown[] = [];

        try {
          const postcssModule = (postcss?.default || postcss) as {
            (plugins?: unknown[]): {
              process: (css: string, options?: Record<string, unknown>) => Promise<PostCSSResult>;
            };
          };

          const processOptions: Record<string, unknown> = {
            from: fullPath,
          };

          if (parser) {
            const parserModule = (parser.default || parser) as unknown;
            processOptions.parser = parserModule;
          }

          const result = await postcssModule(plugins).process(styleContent, processOptions);

          result.root.walkDecls((decl: PostCSSDeclaration) => {
            if (decl.prop !== 'z-index') {
              return;
            }

            const value = parseInt(decl.value, 10);
            if (isNaN(value)) {
              return;
            }

            if (value > maxZIndex) {
              const line = decl.source?.start?.line ?? 1;
              context.report({
                line,
                category: 'maintainability',
                ruleId: 'maintainability/no-large-z-index',
                severity: 'warning' as IssueSeverity,
                message: `z-index 值 ${value} 过大（超过 ${maxZIndex}），建议使用更小的值以便维护。`,
                suggestion: `建立统一的 z-index 层级系统，例如：基础层 0-99，弹窗层 100-199，提示层 200-299。`,
                fixSuggestion: {
                  title: '降低 z-index 值',
                  description: '过大的 z-index 值难以维护，容易导致层级混乱。应建立统一的层级系统。',
                  fixType: 'guided' as const,
                  steps: [
                    { step: 1, action: '建立层级系统', detail: '定义统一的 z-index 层级规范，如：基础层 0-99，弹窗层 100-199，提示层 200-299' },
                    { step: 2, action: '替换过大值', detail: '将过大的 z-index 值替换为层级系统中的合适值' },
                    { step: 3, action: '文档化规范', detail: '在项目文档中记录 z-index 层级规范，供团队参考' },
                  ],
                  codeExample: {
                    before: `.modal { z-index: 9999; }
.tooltip { z-index: 999999; }`,
                    after: `.modal { z-index: 100; }
.tooltip { z-index: 200; }`,
                  },
                  references: [
                    { title: 'MDN - z-index', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/z-index' },
                    { title: 'CSS Guidelines - z-index', url: 'https://cssguidelin.es/#z-index' },
                  ],
                },
              });
            }
          });
        } catch {
          // 解析失败，静默跳过
        }
      },
    };
  },
};
