import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode } from '../../ast-types.js';

// PostCSS 类型定义（简化版，因为是可选依赖）
interface PostCSSModule {
  default?: unknown;
  [key: string]: unknown;
}

interface PostCSSDeclaration {
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

/**
 * 动态导入的类型定义
 */
async function safeImport(moduleName: string): Promise<PostCSSModule | undefined> {
  try {
    return await import(moduleName) as PostCSSModule;
  } catch {
    // PostCSS 是可选依赖，未安装时静默跳过
    return undefined;
  }
}

/**
 * 动态加载 PostCSS 及其解析器
 */
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

/**
 * px 整数规则配置选项
 */
interface PxIntegerRuleOptions {
  /** 是否允许 0px */
  allowZero?: boolean;
  /** 允许的特定小数列表，如 [.5, .25] */
  allowDecimals?: number[];
  /** 是否忽略 CSS 变量 (var(--name)) */
  ignoreVariables?: boolean;
  /** 是否忽略 calc() 表达式 */
  ignoreCalc?: boolean;
}

/**
 * 根据文件扩展名获取对应的 PostCSS 解析器
 */
function getParser(extension: string) {
  switch (extension) {
    case 'scss':
      return postcssScss;
    case 'less':
      return postcssLess;
    case 'sass':
      // postcss-sass 可能需要，暂时不添加以减少依赖
      return undefined;
    default:
      return undefined;
  }
}

/**
 * 检查 px 值是否为整数
 */
function checkPxValue(value: string, options: PxIntegerRuleOptions): boolean {
  // 提取所有带 px 单位的值
  const pxMatches = value.match(/(\d+\.?\d*)px/g);
  if (!pxMatches) return true; // 没有 px 单位，通过

  for (const match of pxMatches) {
    const numStr = match.replace('px', '');
    const num = parseFloat(numStr);

    // 允许 0
    if (options.allowZero && num === 0) {
      continue;
    }

    // 检查是否在允许的小数列表中
    if (options.allowDecimals && options.allowDecimals.includes(num)) {
      continue;
    }

    // 检查是否为整数
    if (!Number.isInteger(num)) {
      return false; // 发现小数 px 值
    }
  }

  return true; // 所有 px 值都是整数
}

/**
 * 检查 Tailwind 任意值语法中的 px 值
 * 例如: top-[278.7px], w-[12.5px], h-[731.5px]
 */
function checkTailwindArbitraryValues(content: string, options: PxIntegerRuleOptions): Array<{ line: number; value: string; className: string }> {
  const issues: Array<{ line: number; value: string; className: string }> = [];
  const lines = content.split('\n');

  // 匹配 Tailwind 任意值语法: 任何 [数字px] 格式
  // 支持: h-[731.5px], top-[278.7px], w-[12.5px]
  const tailwindPattern = /\b([\w-]+)-\[(\d+\.?\d*)px\]/g;

  lines.forEach((line, index) => {
    let match;
    const linePattern = new RegExp(tailwindPattern.source, 'g');

    while ((match = linePattern.exec(line)) !== null) {
      const className = match[1]; // 如 "h", "top", "w"
      const numStr = match[2];
      const num = parseFloat(numStr);

      // 允许 0
      if (options.allowZero && num === 0) {
        continue;
      }

      // 检查是否在允许的小数列表中
      if (options.allowDecimals && options.allowDecimals.includes(num)) {
        continue;
      }

      // 检查是否为整数
      if (!Number.isInteger(num)) {
        issues.push({
          line: index + 1,
          value: `${numStr}px`,
          className: `${className}-[${numStr}px]`,
        });
      }
    }
  });

  return issues;
}

/**
 * 检查 CSS px 单位必须为整数
 * 确保设计系统一致性，避免 20.5px, 12.22px 等不规范值
 */
export const pxIntegerUnitsRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/integer-pixel-units',
  create(context: AstRuleContext) {
    const options = (context.ruleOptions || {}) as PxIntegerRuleOptions;
    const allowZero = options.allowZero ?? true;
    const allowDecimals = options.allowDecimals ?? [];
    const ignoreVariables = options.ignoreVariables ?? true;
    const ignoreCalc = options.ignoreCalc ?? true;

    return {
      // 在程序退出时处理独立文件
      async 'Program:exit'(node: BaseASTNode) {
        const filePath = context.filePath;
        const extension = filePath.split('.').pop()?.toLowerCase() || '';

        // 仅处理 CSS/SCSS/LESS/Vue 文件
        if (!['css', 'scss', 'less', 'sass', 'vue'].includes(extension)) {
          return;
        }

        // 读取文件内容
        const projectRoot = context.projectRoot || process.cwd();
        const path = await import('node:path');

        // 统一处理路径：如果是相对路径，拼接项目根目录
        let fullPath: string;
        if (path.isAbsolute(filePath)) {
          fullPath = filePath;
        } else {
          fullPath = path.join(projectRoot, filePath);
        }

        let content: string;
        try {
          const fs = await import('node:fs/promises');
          content = await fs.readFile(fullPath, 'utf8');
        } catch {
          return; // 无法读取文件，跳过
        }

        // 检查 Tailwind 任意值语法（整个文件，包括模板和样式）
        const tailwindIssues = checkTailwindArbitraryValues(content, options);
        for (const issue of tailwindIssues) {
          const decimalValue = parseFloat(issue.value);
          const fixedValue = Math.round(decimalValue);

          context.report({
            line: issue.line,
            category: 'maintainability',
            ruleId: 'maintainability/integer-pixel-units',
            severity: 'warning' as IssueSeverity,
            message: `Tailwind 任意值 "${issue.className}" 使用了小数 px，请使用整数值以保持设计系统一致性。`,
            suggestion: `将 "${issue.value}" 改为 "${fixedValue}px"。如确需小数值，请在规则配置中添加到 allowDecimals 列表。`,
            fixSuggestion: {
              title: '将小数像素改为整数',
              description: `Tailwind 任意值中的小数像素会导致渲染不一致，建议使用整数值。`,
              fixType: 'safe',
              autoFix: {
                before: issue.className,
                after: issue.className.replace(issue.value, `${fixedValue}px`),
                description: `将 ${issue.value} 四舍五入为 ${fixedValue}px`,
              },
            },
          });
        }

        // 动态加载 PostCSS
        await loadPostCSS();

        // 如果没有 postcss，静默跳过
        if (!postcss || (extension !== 'css' && !postcssScss && !postcssLess)) {
          return;
        }

        let styleContent = content;
        let styleExtension = extension;
        let styleStartLine = 1; // 记录 <style> 标签在文件中的起始行号

        // 如果是 Vue 文件，提取 <style> 标签内容
        if (extension === 'vue') {
          const styleMatch = content.match(/<style(\s+[^>]*)?>([\s\S]*?)<\/style>/i);
          if (!styleMatch) {
            return;
          }

          // 计算 <style> 标签前有多少行
          const beforeStyle = content.substring(0, styleMatch.index);
          styleStartLine = beforeStyle.split('\n').length;

          // 获取 style 标签的 lang 属性
          const langMatch = styleMatch[1]?.match(/lang=["']([^"']+)["']/i);
          const lang = langMatch ? langMatch[1].toLowerCase() : 'css';

          // 设置扩展名和内容
          styleExtension = lang === 'scss' ? 'scss' : lang === 'less' ? 'less' : lang === 'sass' ? 'sass' : 'css';
          styleContent = styleMatch[2];
        }

        // 使用 PostCSS 解析
        const parser = getParser(styleExtension);
        const plugins: unknown[] = [];

        try {
          // ES module 动态导入返回的是模块对象，需要调用 default
          const postcssModule = (postcss?.default || postcss) as {
            (plugins?: unknown[]): {
              process: (css: string, options?: Record<string, unknown>) => Promise<PostCSSResult>;
            };
          };

          // 根据文件类型设置 parser 选项
          const processOptions: Record<string, unknown> = {
            from: fullPath,
          };

          // 如果有特定的 parser（如 postcss-scss, postcss-less），则使用它
          if (parser) {
            const parserModule = (parser.default || parser) as unknown;
            processOptions.parser = parserModule;
          }

          const result = await postcssModule(plugins).process(styleContent, processOptions);

          // 遍历所有声明
          result.root.walkDecls((decl: PostCSSDeclaration) => {
            // 检查声明值是否包含 px 单位
            if (!decl.value || !decl.value.includes('px')) {
              return;
            }

            // 忽略变量引用
            if (ignoreVariables && (decl.value.startsWith('var(') || decl.value.startsWith('--'))) {
              return;
            }

            // 忽略 calc 表达式
            if (ignoreCalc && decl.value.includes('calc(')) {
              return;
            }

            // 检查 px 值是否为整数
            if (!checkPxValue(decl.value, options)) {
              const declLine = decl.source?.start?.line ?? 1;
              // 如果是 Vue 文件，需要加上 <style> 标签前的行数
              const actualLine = extension === 'vue' ? styleStartLine + declLine : declLine;
              const valueMatch = decl.value.match(/(\d+\.\d+)px/);
              const decimalValue = valueMatch ? valueMatch[1] : decl.value;

              context.report({
                line: actualLine,
                category: 'maintainability',
                ruleId: 'maintainability/integer-pixel-units',
                severity: 'warning' as IssueSeverity,
                message: `px 单位值 "${decimalValue}px" 不是整数，请使用整数值以保持设计系统一致性。`,
                suggestion: `将 "${decimalValue}px" 改为 "${Math.round(parseFloat(decimalValue))}px"。如确需小数值，请在规则配置中添加到 allowDecimals 列表。`,
              });
            }
          });
        } catch {
          // 解析失败，静默跳过（可能是无效的 CSS）
        }
      },
    };
  },
};
