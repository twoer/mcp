import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  Literal,
  TemplateLiteral,
  Property,
  Identifier,
} from '../../ast-types.js';

/**
 * vue-i18n v9+ 特殊字符
 * 这些字符在 vue-i18n 中有特殊含义，直接使用会导致编译错误
 */
const SPECIAL_CHARS = {
  '@': '链接消息 (Linked messages)',
  '{': '插值开始 (Interpolation start)',
  '}': '插值结束 (Interpolation end)',
  '|': '复数分隔 (Plural separator)',
} as const;

/**
 * 检查字符是否已被正确转义
 * vue-i18n v9+ 支持的转义格式：{'@'}
 */
function isEscaped(text: string, charIndex: number, char: string): boolean {
  // 检查是否是 {'@'} 格式
  // 向前查找 {' 向后查找 '}
  if (char === '@' || char === '|' || char === '{' || char === '}') {
    // 检查 {'@'} 格式
    if (charIndex >= 2 && charIndex <= text.length - 2) {
      const before = text.slice(charIndex - 2, charIndex);
      const after = text.slice(charIndex + 1, charIndex + 3);
      if (before === "{'" && after === "'}") {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查字符串中是否包含未转义的特殊字符
 */
function findUnescapedSpecialChars(text: string): Array<{ char: string; index: number; description: string }> {
  const result: Array<{ char: string; index: number; description: string }> = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char in SPECIAL_CHARS && !isEscaped(text, i, char)) {
      // 对于 { 和 }，需要检查是否是成对的插值表达式
      if (char === '{') {
        // 检查是否是插值表达式 {name} 或 {count, number}
        // 如果 { 后面跟着 } 在合理范围内，则可能是有效的插值
        const closingBrace = text.indexOf('}', i);
        if (closingBrace > i && closingBrace - i <= 50) {
          // 检查内容是否看起来像有效的插值表达式
          const content = text.slice(i + 1, closingBrace);
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(content.trim()) ||
              /^[a-zA-Z_][a-zA-Z0-9_]*\s*,\s*\w+$/.test(content.trim())) {
            // 这是一个有效的插值表达式，跳过
            i = closingBrace;
            continue;
          }
        }
      }

      result.push({
        char,
        index: i,
        description: SPECIAL_CHARS[char as keyof typeof SPECIAL_CHARS],
      });
    }
  }

  return result;
}

/**
 * 判断文件路径是否可能是 i18n 翻译文件
 */
function isI18nFile(filePath: string): boolean {
  const i18nPatterns = [
    /\/locales?\//,           // /locales/ 或 /locale/
    /\/lang(?:uages)?\//,     // /lang/ 或 /languages/
    /\/i18n\//,               // /i18n/
    /[\/\\]i18n[\/\\]/,       // \i18n\
    /\.i18n\./,               // .i18n.json, .i18n.ts
    /translations?\//,        // /translations/
    /\/messages\//,           // /messages/
    /locale[-_]/,             // locale-zh, locale_en
    /[-_]locale\./,           // zh-locale.json, en.locale.json
    /zh[-_]cn/i,              // zh-cn, zh_CN
    /en[-_]us/i,              // en-us, en_US
    /zh[-_]tw/i,              // zh-tw
  ];

  return i18nPatterns.some(pattern => pattern.test(filePath.toLowerCase()));
}

/**
 * 获取字符串值
 */
function getStringValue(node: BaseASTNode | null | undefined): string | null {
  if (!node) return null;

  if (node.type === 'Literal' && typeof (node as Literal).value === 'string') {
    return (node as Literal).value as string;
  }

  if (node.type === 'TemplateLiteral') {
    const templateLit = node as TemplateLiteral;
    if (templateLit.expressions.length === 0 && templateLit.quasis.length > 0) {
      const cooked = templateLit.quasis[0].value.cooked;
      return cooked ?? null;
    }
  }

  return null;
}

function reportIssue(
  context: AstRuleContext,
  line: number,
  message: string,
  suggestion?: string,
  char?: string,
): void {
  context.report({
    line,
    category: 'maintainability',
    ruleId: 'maintainability/i18n-special-chars',
    severity: 'warning' as IssueSeverity,
    message,
    suggestion,
    fixSuggestion: {
      title: '转义国际化特殊字符',
      description: '使用 vue-i18n v9+ 的转义语法处理特殊字符',
      fixType: 'safe' as const,
      codeExample: {
        before: `{
  "message": "邮箱格式：user@example.com"
}`,
        after: `{
  "message": "邮箱格式：user{'@'}example.com"
}`,
      },
      references: [
        { title: 'vue-i18n v9 Migration', url: 'https://vue-i18n.intlify.dev/guide/migration/vue3.html' },
      ],
    },
  });
}

export const i18nSpecialCharsRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/i18n-special-chars',
  create(context: AstRuleContext) {
    // 只检查 i18n 相关文件
    const isTargetFile = isI18nFile(context.filePath);

    return {
      Property(node: BaseASTNode) {
        // 如果不是 i18n 文件，只检查属性名包含 i18n 相关字样的
        if (!isTargetFile) {
          const propNode = node as Property;
          const key = propNode.key;
          let keyName: string | undefined;

          if (key) {
            if (key.type === 'Identifier') {
              keyName = (key as Identifier).name;
            } else if (key.type === 'Literal' && typeof (key as Literal).value === 'string') {
              keyName = (key as Literal).value as string;
            }
          }

          // 非i18n文件中，只检查明显与i18n相关的属性
          if (!keyName || !/i18n|locale|translation|message|lang/i.test(keyName)) {
            return;
          }
        }

        const propNode = node as Property;
        const value = propNode.value as BaseASTNode | null;
        const stringValue = getStringValue(value);

        if (!stringValue) return;

        const unescapedChars = findUnescapedSpecialChars(stringValue);

        if (unescapedChars.length > 0) {
          const line = node.loc?.start?.line ?? 1;
          const charList = unescapedChars.map(c => `'${c.char}'(${c.description})`).join(', ');

          reportIssue(
            context,
            line,
            `i18n 字符串包含未转义的特殊字符: ${charList}。在 vue-i18n v9+ 中可能导致编译错误。`,
            `使用 {'${unescapedChars[0].char}'} 格式转义特殊字符，例如: "仅允许字母和{'@'}符号"`,
            unescapedChars[0].char,
          );
        }
      },

      VariableDeclarator(node: BaseASTNode) {
        // 变量声明中的字符串检查
        const varNode = node as { id?: BaseASTNode; init?: BaseASTNode | null };
        const id = varNode.id;
        const init = varNode.init;

        if (!id || id.type !== 'Identifier') return;

        const name = (id as Identifier).name;

        // 只检查与 i18n 相关的变量
        if (!isTargetFile && !/i18n|locale|translation|message|lang/i.test(name)) {
          return;
        }

        const stringValue = getStringValue(init);
        if (!stringValue) return;

        const unescapedChars = findUnescapedSpecialChars(stringValue);

        if (unescapedChars.length > 0) {
          const line = node.loc?.start?.line ?? 1;
          const charList = unescapedChars.map(c => `'${c.char}'(${c.description})`).join(', ');

          reportIssue(
            context,
            line,
            `i18n 变量 "${name}" 包含未转义的特殊字符: ${charList}。在 vue-i18n v9+ 中可能导致编译错误。`,
            `使用 {'${unescapedChars[0].char}'} 格式转义特殊字符，例如: "仅允许字母和{'@'}符号"`,
          );
        }
      },
    };
  },
};
