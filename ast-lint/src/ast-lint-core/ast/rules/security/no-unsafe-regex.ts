import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, Literal, CallExpression, NewExpression } from '../../ast-types.js';

/**
 * 危险的正则表达式模式
 * 这些模式可能导致ReDoS（正则表达式拒绝服务）攻击
 */
const DANGEROUS_PATTERNS = [
  // 嵌套量词 (a+)+
  /(\([^)]*\)|\[.*?\]|.)([*+?]\+|\*\*|\+{2,}|\?{2,})/g,
  // 重复的量词 a{1,100}.*
  /\{[0-9]+,[0-9]+\}[*+]/g,
  // 过多的交替操作符
  /\|{3,}/g,
  // 深层嵌套
  /\([^()]*\([^()]*\([^()]*\)[^()]*\)[^()]*\)/g,
];

/**
 * 检测可能导致ReDoS攻击的不安全正则表达式
 * 复杂的正则表达式可能导致拒绝服务攻击
 */
export const noUnsafeRegexRule: RuleDefinition<AstRuleContext> = {
  id: 'security/no-unsafe-regex',
  create(context: AstRuleContext) {
    return {
      // 检测正则表达式字面量 /pattern/
      Literal(node: BaseASTNode) {
        const literal = node as Literal;
        if (literal.regex) {
          const pattern = literal.regex.pattern;
          checkRegexPattern(context, pattern, node.loc?.start?.line ?? 1);
        }
      },

      // 检测 RegExp 构造函数调用 new RegExp(pattern)
      CallExpression(node: BaseASTNode) {
        processRegExpCall(context, node as CallExpression);
      },

      // 检测 new RegExp(pattern) 构造
      NewExpression(node: BaseASTNode) {
        processRegExpCall(context, node as NewExpression);
      },
    };
  },
};

/**
 * 处理 RegExp 构造函数调用（包括 CallExpression 和 NewExpression）
 */
function processRegExpCall(context: AstRuleContext, node: CallExpression | NewExpression): void {
  if (!node.callee) return;

  const callee = node.callee;

  if (callee.type === 'Identifier' && (callee as any).name === 'RegExp') {
    const args = node.arguments;
    if (args && args.length > 0) {
      const firstArg = args[0];
      let pattern = '';

      // 提取模式字符串
      if (firstArg.type === 'Literal' && typeof (firstArg as Literal).value === 'string') {
        pattern = (firstArg as Literal).value as string;
      } else if (firstArg.type === 'TemplateLiteral') {
        // 模板字符串难以静态分析，只做简单提示
        const line = node.loc?.start?.line ?? 1;
        context.report({
          line,
          category: 'security',
          ruleId: 'security/no-unsafe-regex',
          severity: 'warning' as IssueSeverity,
          message: '使用模板字符串构造正则表达式时，请确保避免ReDoS风险。',
          suggestion: '如果使用动态构造正则表达式，请确保输入经过充分验证，避免恶意输入导致ReDoS。',
          fixSuggestion: {
            title: '修复不安全的正则表达式',
            description: '复杂的正则表达式可能导致 ReDoS（正则表达式拒绝服务）攻击。应简化模式或使用更安全的匹配方式。',
            fixType: 'guided' as const,
            steps: [
              { step: 1, action: '识别问题模式', detail: '检查是否存在嵌套量词（如 (a+)+）、过多交替符（|）或贪婪通配符（.*）' },
              { step: 2, action: '简化正则表达式', detail: '移除嵌套量词，使用更精确的字符类替代通配符' },
              { step: 3, action: '测试性能', detail: '使用长字符串测试正则表达式性能，确保不会导致超时' },
            ],
            codeExample: {
              before: `// 危险：嵌套量词
const regex = /(a+)+b/;
// 危险：过多贪婪通配符
const regex2 = /.*.*.*@.*/;`,
              after: `// 安全：避免嵌套量词
const regex = /a+b/;
// 安全：使用更精确的模式
const regex2 = /[^@]+@[^@]+/;`,
            },
            references: [
              { title: 'OWASP - ReDoS', url: 'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS' },
              { title: 'MDN - RegExp', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp' },
            ],
          },
        });
        return;
      }

      if (pattern) {
        checkRegexPattern(context, pattern, node.loc?.start?.line ?? 1);
      }
    }
  }
}

/**
 * 检查正则表达式模式是否包含危险模式
 */
function checkRegexPattern(context: AstRuleContext, pattern: string, line: number): void {
  // 基础检查：模式长度
  if (pattern.length > 200) {
    context.report({
      line,
      category: 'security',
      ruleId: 'security/no-unsafe-regex',
      severity: 'warning' as IssueSeverity,
      message: `正则表达式模式过长（${pattern.length} 字符），可能存在ReDoS风险。`,
      suggestion: '考虑简化正则表达式或分解为多个步骤处理。',
      fixSuggestion: {
        title: '修复不安全的正则表达式',
        description: '复杂的正则表达式可能导致 ReDoS（正则表达式拒绝服务）攻击。应简化模式或使用更安全的匹配方式。',
        fixType: 'guided' as const,
        steps: [
          { step: 1, action: '识别问题模式', detail: '检查是否存在嵌套量词（如 (a+)+）、过多交替符（|）或贪婪通配符（.*）' },
          { step: 2, action: '简化正则表达式', detail: '移除嵌套量词，使用更精确的字符类替代通配符' },
          { step: 3, action: '测试性能', detail: '使用长字符串测试正则表达式性能，确保不会导致超时' },
        ],
        codeExample: {
          before: `// 危险：嵌套量词
const regex = /(a+)+b/;
// 危险：过多贪婪通配符
const regex2 = /.*.*.*@.*/;`,
          after: `// 安全：避免嵌套量词
const regex = /a+b/;
// 安全：使用更精确的模式
const regex2 = /[^@]+@[^@]+/;`,
        },
        references: [
          { title: 'OWASP - ReDoS', url: 'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS' },
          { title: 'MDN - RegExp', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp' },
        ],
      },
    });
    return;
  }

  // 检查嵌套量词
  const nestedQuantifiers = /\([^)]*([*+?])[^)]*\)\1|(\[[^\]]*[*+?][^\]]*\])[*+?]/g;
  if (nestedQuantifiers.test(pattern)) {
    context.report({
      line,
      category: 'security',
      ruleId: 'security/no-unsafe-regex',
      severity: 'error' as IssueSeverity,
      message: '检测到嵌套量词，可能导致ReDoS攻击。',
      suggestion: '避免使用嵌套量词，如 (a+)+、(a*)* 等。',
      fixSuggestion: {
        title: '修复不安全的正则表达式',
        description: '复杂的正则表达式可能导致 ReDoS（正则表达式拒绝服务）攻击。应简化模式或使用更安全的匹配方式。',
        fixType: 'guided' as const,
        steps: [
          { step: 1, action: '识别问题模式', detail: '检查是否存在嵌套量词（如 (a+)+）、过多交替符（|）或贪婪通配符（.*）' },
          { step: 2, action: '简化正则表达式', detail: '移除嵌套量词，使用更精确的字符类替代通配符' },
          { step: 3, action: '测试性能', detail: '使用长字符串测试正则表达式性能，确保不会导致超时' },
        ],
        codeExample: {
          before: `// 危险：嵌套量词
const regex = /(a+)+b/;
// 危险：过多贪婪通配符
const regex2 = /.*.*.*@.*/;`,
          after: `// 安全：避免嵌套量词
const regex = /a+b/;
// 安全：使用更精确的模式
const regex2 = /[^@]+@[^@]+/;`,
        },
        references: [
          { title: 'OWASP - ReDoS', url: 'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS' },
          { title: 'MDN - RegExp', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp' },
        ],
      },
    });
    return;
  }

  // 检查过多的交替操作符
  const pipeCount = (pattern.match(/\|/g) || []).length;
  if (pipeCount > 5) {
    context.report({
      line,
      category: 'security',
      ruleId: 'security/no-unsafe-regex',
      severity: 'warning' as IssueSeverity,
      message: `正则表达式包含过多的交替操作符（${pipeCount} 个），可能影响性能。`,
      suggestion: '考虑使用字符类或优化正则表达式结构。',
      fixSuggestion: {
        title: '修复不安全的正则表达式',
        description: '复杂的正则表达式可能导致 ReDoS（正则表达式拒绝服务）攻击。应简化模式或使用更安全的匹配方式。',
        fixType: 'guided' as const,
        steps: [
          { step: 1, action: '识别问题模式', detail: '检查是否存在嵌套量词（如 (a+)+）、过多交替符（|）或贪婪通配符（.*）' },
          { step: 2, action: '简化正则表达式', detail: '移除嵌套量词，使用更精确的字符类替代通配符' },
          { step: 3, action: '测试性能', detail: '使用长字符串测试正则表达式性能，确保不会导致超时' },
        ],
        codeExample: {
          before: `// 危险：嵌套量词
const regex = /(a+)+b/;
// 危险：过多贪婪通配符
const regex2 = /.*.*.*@.*/;`,
          after: `// 安全：避免嵌套量词
const regex = /a+b/;
// 安全：使用更精确的模式
const regex2 = /[^@]+@[^@]+/;`,
        },
        references: [
          { title: 'OWASP - ReDoS', url: 'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS' },
          { title: 'MDN - RegExp', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp' },
        ],
      },
    });
  }

  // 检查贪婪量词 + .*
  const greedyDots = /\.\*/g;
  const greedyMatches = pattern.match(greedyDots);
  if (greedyMatches && greedyMatches.length > 2) {
    context.report({
      line,
      category: 'security',
      ruleId: 'security/no-unsafe-regex',
      severity: 'warning' as IssueSeverity,
      message: `正则表达式包含多个贪婪通配符（${greedyMatches.length} 个），可能导致回溯问题。`,
      suggestion: '考虑使用惰性量词 .*? 或更精确的模式匹配。',
      fixSuggestion: {
        title: '修复不安全的正则表达式',
        description: '复杂的正则表达式可能导致 ReDoS（正则表达式拒绝服务）攻击。应简化模式或使用更安全的匹配方式。',
        fixType: 'guided' as const,
        steps: [
          { step: 1, action: '识别问题模式', detail: '检查是否存在嵌套量词（如 (a+)+）、过多交替符（|）或贪婪通配符（.*）' },
          { step: 2, action: '简化正则表达式', detail: '移除嵌套量词，使用更精确的字符类替代通配符' },
          { step: 3, action: '测试性能', detail: '使用长字符串测试正则表达式性能，确保不会导致超时' },
        ],
        codeExample: {
          before: `// 危险：嵌套量词
const regex = /(a+)+b/;
// 危险：过多贪婪通配符
const regex2 = /.*.*.*@.*/;`,
          after: `// 安全：避免嵌套量词
const regex = /a+b/;
// 安全：使用更精确的模式
const regex2 = /[^@]+@[^@]+/;`,
        },
        references: [
          { title: 'OWASP - ReDoS', url: 'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS' },
          { title: 'MDN - RegExp', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp' },
        ],
      },
    });
  }

  // 检查反向引用
  const backrefs = (pattern.match(/\\[1-9]/g) || []).length;
  if (backrefs > 3) {
    context.report({
      line,
      category: 'security',
      ruleId: 'security/no-unsafe-regex',
      severity: 'info' as IssueSeverity,
      message: `正则表达式包含多个反向引用（${backrefs} 个），可能影响性能。`,
      suggestion: '考虑优化正则表达式结构或使用命名捕获组。',
      fixSuggestion: {
        title: '修复不安全的正则表达式',
        description: '复杂的正则表达式可能导致 ReDoS（正则表达式拒绝服务）攻击。应简化模式或使用更安全的匹配方式。',
        fixType: 'guided' as const,
        steps: [
          { step: 1, action: '识别问题模式', detail: '检查是否存在嵌套量词（如 (a+)+）、过多交替符（|）或贪婪通配符（.*）' },
          { step: 2, action: '简化正则表达式', detail: '移除嵌套量词，使用更精确的字符类替代通配符' },
          { step: 3, action: '测试性能', detail: '使用长字符串测试正则表达式性能，确保不会导致超时' },
        ],
        codeExample: {
          before: `// 危险：嵌套量词
const regex = /(a+)+b/;
// 危险：过多贪婪通配符
const regex2 = /.*.*.*@.*/;`,
          after: `// 安全：避免嵌套量词
const regex = /a+b/;
// 安全：使用更精确的模式
const regex2 = /[^@]+@[^@]+/;`,
        },
        references: [
          { title: 'OWASP - ReDoS', url: 'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS' },
          { title: 'MDN - RegExp', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp' },
        ],
      },
    });
  }
}
