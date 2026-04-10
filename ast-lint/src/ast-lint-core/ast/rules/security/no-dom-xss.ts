import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  CallExpression,
  AssignmentExpression,
  MemberExpression,
  Identifier,
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

  // 如果是成员表达式，递归检查
  if (object.type === 'MemberExpression') {
    // 例如: document.querySelector('#test')
    return isLikelyDOMElement((object as MemberExpression).object as ExpressionNode);
  }

  // 如果是调用表达式，返回结果通常是DOM元素
  if (object.type === 'CallExpression') {
    return true;
  }

  // 默认情况下，假设是DOM元素（保守策略）
  return true;
}

/**
 * 危险的DOM操作方法列表
 * 这些方法如果直接使用用户输入，可能导致XSS攻击
 */
const DANGEROUS_DOM_METHODS = [
  'insertAdjacentHTML',
  'write',
  'writeln',
  'outerHTML',
];

/**
 * 可能导致XSS的属性
 */
const DANGEROUS_PROPERTIES = [
  'innerHTML',
  'outerHTML',
];

/**
 * 检测可能导致DOM XSS的危险操作
 * 直接将用户输入插入到DOM中可能导致XSS攻击
 */
export const noDomXssRule: RuleDefinition<AstRuleContext> = {
  id: 'security/no-dom-xss',
  create(context: AstRuleContext) {
    return {
      CallExpression(node: BaseASTNode) {
        const callExpr = node as CallExpression;
        if (!callExpr.callee) return;

        // 检测危险的DOM方法调用
        if (callExpr.callee.type === 'MemberExpression') {
          const memberCallee = callExpr.callee as MemberExpression;
          const property = memberCallee.property;
          const object = memberCallee.object;

          if (property && property.type === 'Identifier') {
            const methodName = property.name;

            // 检查是否是危险方法
            if (DANGEROUS_DOM_METHODS.includes(methodName)) {
              const line = node.loc?.start?.line ?? 1;
              context.report({
                line,
                category: 'security',
                ruleId: 'security/no-dom-xss',
                severity: 'error' as IssueSeverity,
                message: `检测到危险的DOM操作：${methodName}() 可能导致XSS攻击。`,
                suggestion: '使用安全的DOM操作方法，如 textContent、createElement、createTextNode，或对输入进行转义处理。',
                fixSuggestion: {
                  title: '防止 DOM XSS 攻击',
                  description: '直接将用户输入插入到 DOM 中可能导致 XSS 攻击。应使用安全的 DOM 操作方法或对输入进行转义。',
                  fixType: 'manual' as const,
                  codeExample: {
                    before: `// 危险：直接插入 HTML
element.insertAdjacentHTML('beforeend', userInput);
document.write(userInput);`,
                    after: `// 安全：使用 textContent 或转义
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);`,
                  },
                  references: [
                    { title: 'OWASP - XSS Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
                    { title: 'MDN - textContent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent' },
                  ],
                },
              });
            }
          }

          // 检测 document.write() 的使用
          if (object.type === 'Identifier' && (object as Identifier).name === 'document') {
            if (property && property.type === 'Identifier' && property.name === 'write') {
              const line = node.loc?.start?.line ?? 1;
              context.report({
                line,
                category: 'security',
                ruleId: 'security/no-dom-xss',
                severity: 'error' as IssueSeverity,
                message: '使用 document.write() 可能导致XSS攻击，应避免使用。',
                suggestion: '使用安全的DOM操作方法替代 document.write()。',
                fixSuggestion: {
                  title: '防止 DOM XSS 攻击',
                  description: '直接将用户输入插入到 DOM 中可能导致 XSS 攻击。应使用安全的 DOM 操作方法或对输入进行转义。',
                  fixType: 'manual' as const,
                  codeExample: {
                    before: `// 危险：直接插入 HTML
element.insertAdjacentHTML('beforeend', userInput);
document.write(userInput);`,
                    after: `// 安全：使用 textContent 或转义
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);`,
                  },
                  references: [
                    { title: 'OWASP - XSS Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
                    { title: 'MDN - textContent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent' },
                  ],
                },
              });
            }
          }
        }
      },

      AssignmentExpression(node: BaseASTNode) {
        const assignExpr = node as AssignmentExpression;
        // 检测对危险属性的直接赋值
        if (assignExpr.left && assignExpr.left.type === 'MemberExpression') {
          const memberLeft = assignExpr.left as MemberExpression;
          const property = memberLeft.property;
          const object = memberLeft.object;

          if (property && property.type === 'Identifier') {
            const propertyName = property.name;

            // 只检查对 DOM 元素对象的危险属性赋值
            if (DANGEROUS_PROPERTIES.includes(propertyName) && isLikelyDOMElement(object as ExpressionNode)) {
              const line = node.loc?.start?.line ?? 1;
              context.report({
                line,
                category: 'security',
                ruleId: 'security/no-dom-xss',
                severity: 'error' as IssueSeverity,
                message: `直接赋值给 ${propertyName} 可能导致XSS攻击。`,
                suggestion: '使用安全的DOM操作方法，如 textContent、innerText，或对输入进行转义处理。',
                fixSuggestion: {
                  title: '防止 DOM XSS 攻击',
                  description: '直接将用户输入插入到 DOM 中可能导致 XSS 攻击。应使用安全的 DOM 操作方法或对输入进行转义。',
                  fixType: 'manual' as const,
                  codeExample: {
                    before: `// 危险：直接插入 HTML
element.insertAdjacentHTML('beforeend', userInput);
document.write(userInput);`,
                    after: `// 安全：使用 textContent 或转义
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);`,
                  },
                  references: [
                    { title: 'OWASP - XSS Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
                    { title: 'MDN - textContent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent' },
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
