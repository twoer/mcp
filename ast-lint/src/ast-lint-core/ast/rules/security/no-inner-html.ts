import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  MemberExpression,
  AssignmentExpression,
  VariableDeclarator,
  ObjectPattern,
  Property,
  Identifier,
  ThisExpression,
  TSAsExpression,
  TaggedTemplateExpression,
  CallExpression,
} from '../../ast-types.js';

type ExpressionNode = BaseASTNode;

/**
 * 判断对象是否可能是DOM元素
 */
function isLikelyDOMElement(object: ExpressionNode | null | undefined): boolean {
  if (!object) return false;

  // 如果是标识符，检查是否是常见的DOM相关名称
  if (object.type === 'Identifier') {
    const name = (object as Identifier).name;

    // 常见的DOM相关标识符
    const domIdentifiers = [
      'document', 'window', 'element', 'elem', 'div', 'span', 'p', 'a',
      'button', 'input', 'form', 'img', 'ul', 'li', 'table', 'tr', 'td',
      'body', 'head', 'html', 'container', 'wrapper', 'content', 'main',
      'header', 'footer', 'sidebar', 'nav', 'section', 'article'
    ];

    return domIdentifiers.includes(name);
  }

  // 如果是 this 表达式，假设可能是DOM元素（保守策略）
  if (object.type === 'ThisExpression') {
    return true;
  }

  // 如果是 TypeScript 类型断言，递归检查表达式部分
  if (object.type === 'TSAsExpression') {
    return isLikelyDOMElement((object as TSAsExpression).expression as ExpressionNode);
  }

  // 如果是成员表达式，递归检查
  if (object.type === 'MemberExpression') {
    // 例如: document.querySelector('#test'), this.element, this.element.container
    return isLikelyDOMElement((object as MemberExpression).object as ExpressionNode);
  }

  // 如果是调用表达式，可能是DOM操作的结果
  if (object.type === 'CallExpression') {
    // 例如: document.getElementById('test')
    return true;
  }

  // 如果是标签模板字符串，可能是DOM元素
  if (object.type === 'TaggedTemplateExpression') {
    return true;
  }

  // 默认情况下，对于标识符认为是可能的DOM元素（保守策略）
  // 对于其他类型（如数字、字符串字面量）不认为是DOM元素
  return false;
}

/**
 * 检测.innerHTML的使用
 * 直接使用innerHTML可能导致XSS攻击，即使不是赋值操作
 */
export const noInnerHtmlRule: RuleDefinition<AstRuleContext> = {
  id: 'security/no-inner-html',
  create(context: AstRuleContext) {
    return {
      // 检测成员表达式中的 innerHTML 访问
      MemberExpression(node: BaseASTNode) {
        const memberExpr = node as MemberExpression;
        const property = memberExpr.property;
        const object = memberExpr.object;

        if (property && property.type === 'Identifier' && property.name === 'innerHTML') {
          // 只在对象可能是DOM元素时才报告
          if (isLikelyDOMElement(object as ExpressionNode)) {
            const line = node.loc?.start?.line ?? 1;
            context.report({
              line,
              category: 'security',
              ruleId: 'security/no-inner-html',
              severity: 'warning' as IssueSeverity,
              message: '使用 innerHTML 可能导致XSS攻击，建议使用更安全的替代方案。',
              suggestion: '考虑使用 textContent、innerText，或者使用安全的HTML渲染库如 DOMPurify。',
              fixSuggestion: {
                title: '避免使用 innerHTML',
                description: '直接使用 innerHTML 可能导致 XSS 攻击。应使用 textContent 或安全的 HTML 渲染库。',
                fixType: 'manual' as const,
                codeExample: {
                  before: `// 危险：使用 innerHTML
element.innerHTML = userInput;
const html = element.innerHTML;`,
                  after: `// 安全：使用 textContent
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);`,
                },
                references: [
                  { title: 'MDN - innerHTML', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML' },
                  { title: 'OWASP - XSS Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
                ],
              },
            });
          }
        }
      },

      // 检测赋值表达式中的 innerHTML 赋值
      AssignmentExpression(node: BaseASTNode) {
        const assignExpr = node as AssignmentExpression;
        if (assignExpr.left && assignExpr.left.type === 'MemberExpression') {
          const property = assignExpr.left.property;
          const object = assignExpr.left.object;

          if (property && property.type === 'Identifier' && property.name === 'innerHTML') {
            // 只在对象可能是DOM元素时才报告
            if (isLikelyDOMElement(object as ExpressionNode)) {
              const line = node.loc?.start?.line ?? 1;
              context.report({
                line,
                category: 'security',
                ruleId: 'security/no-inner-html',
                severity: 'error' as IssueSeverity,
                message: '禁止直接赋值给 innerHTML，可能导致XSS攻击。',
                suggestion: '使用安全的DOM操作方法，如 textContent、innerHTML 配合转义，或使用安全的HTML库。',
                fixSuggestion: {
                  title: '避免使用 innerHTML',
                  description: '直接使用 innerHTML 可能导致 XSS 攻击。应使用 textContent 或安全的 HTML 渲染库。',
                  fixType: 'manual' as const,
                  codeExample: {
                    before: `// 危险：使用 innerHTML
element.innerHTML = userInput;
const html = element.innerHTML;`,
                    after: `// 安全：使用 textContent
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);`,
                  },
                  references: [
                    { title: 'MDN - innerHTML', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML' },
                    { title: 'OWASP - XSS Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
                  ],
                },
              });
            }
          }
        }
      },

      // 检测解构赋值中的 innerHTML
      VariableDeclarator(node: BaseASTNode) {
        const varDeclarator = node as VariableDeclarator;
        if (varDeclarator.id && varDeclarator.id.type === 'ObjectPattern') {
          const objectPattern = varDeclarator.id as ObjectPattern;
          const properties = objectPattern.properties;

          for (const prop of properties) {
            if (prop.type === 'Property' &&
                prop.key &&
                prop.key.type === 'Identifier' &&
                (prop.key as Identifier).name === 'innerHTML') {
              const line = node.loc?.start?.line ?? 1;
              context.report({
                line,
                category: 'security',
                ruleId: 'security/no-inner-html',
                severity: 'warning' as IssueSeverity,
                message: '避免解构 innerHTML 属性，可能导致XSS攻击。',
                suggestion: '考虑使用更安全的DOM操作方法或解构其他属性。',
                fixSuggestion: {
                  title: '避免使用 innerHTML',
                  description: '直接使用 innerHTML 可能导致 XSS 攻击。应使用 textContent 或安全的 HTML 渲染库。',
                  fixType: 'manual' as const,
                  codeExample: {
                    before: `// 危险：使用 innerHTML
element.innerHTML = userInput;
const html = element.innerHTML;`,
                    after: `// 安全：使用 textContent
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);`,
                  },
                  references: [
                    { title: 'MDN - innerHTML', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML' },
                    { title: 'OWASP - XSS Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
                  ],
                },
              });
            }
          }
        }
      },
    };
  },
};
