import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  IfStatement,
  BlockStatement,
  ReturnStatement,
} from '../../ast-types.js';

/**
 * 检查语句或块中是否包含 return 语句
 */
function containsReturn(node: BaseASTNode | null | undefined): boolean {
  if (!node) return false;

  // 直接是 return 语句
  if (node.type === 'ReturnStatement') return true;

  // 块语句，递归检查
  if (node.type === 'BlockStatement') {
    const block = node as BlockStatement;
    return block.body.some(stmt => containsReturn(stmt));
  }

  // if 语句，检查两个分支
  if (node.type === 'IfStatement') {
    const ifStmt = node as IfStatement;
    return containsReturn(ifStmt.consequent) || containsReturn(ifStmt.alternate);
  }

  // 其他语句类型不包含 return
  return false;
}

/**
 * 检查 if 语句后面是否还有代码
 */
function hasCodeAfterIf(ifStmt: IfStatement): boolean {
  const parent = ifStmt.parent;
  if (!parent) return false;

  // 如果父节点是块语句，检查 if 后面是否有其他语句
  if (parent.type === 'BlockStatement') {
    const block = parent as BlockStatement;
    const ifIndex = block.body.indexOf(ifStmt);
    return ifIndex >= 0 && ifIndex < block.body.length - 1;
  }

  return false;
}

/**
 * 获取 if 语句所在的函数
 */
function getFunctionBody(node: BaseASTNode): BlockStatement | null {
  let current: BaseASTNode | undefined = node;
  while (current) {
    if (current.type === 'FunctionDeclaration' ||
        current.type === 'FunctionExpression' ||
        current.type === 'ArrowFunctionExpression') {
      const body = (current as any).body;
      if (body?.type === 'BlockStatement') {
        return body as BlockStatement;
      }
      // 箭头函数的简写体：() => value
      return null;
    }
    current = current.parent;
  }
  return null;
}

/**
 * 检测可以使用提前返回模式的场景
 * 提前返回可以减少嵌套，提高代码可读性
 *
 * 模式1: if 保护后续代码（guard clause）
 *   if (!isValid) return;
 *   doSomething();
 *
 * 模式2: if-else 中一个分支 return
 *   if (error) { handleError(); return; }
 *   doSomething();
 *   // 可以改为：
 *   if (error) { handleError(); return; }
 *   doSomething();
 */
export const preferEarlyReturnRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/prefer-early-return',
  create(context: AstRuleContext) {
    return {
      IfStatement(node: BaseASTNode) {
        const ifStmt = node as IfStatement;
        const consequent = ifStmt.consequent;
        const alternate = ifStmt.alternate;

        // 获取函数体，确保我们在函数内
        const functionBody = getFunctionBody(ifStmt);
        if (!functionBody) return;

        // 检查 if 后面是否还有代码
        const ifIndex = functionBody.body.indexOf(ifStmt);
        const hasCodeAfter = ifIndex >= 0 && ifIndex < functionBody.body.length - 1;

        if (!hasCodeAfter) {
          // if 是最后一条语句，不需要检查
          return;
        }

        const consequentHasReturn = containsReturn(consequent);
        const alternateHasReturn = alternate ? containsReturn(alternate) : false;

        // 模式1: if (!condition) { return; } else { ... }
        // 可以改为：if (!condition) return;
        if (alternate && consequentHasReturn && !alternateHasReturn) {
          const line = ifStmt.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/prefer-early-return',
            severity: 'info' as IssueSeverity,
            message: 'if 分支中只有 return 语句，可以考虑反转条件后提前返回，减少嵌套。',
            suggestion: '将 if 条件取反，然后提前返回。例如：if (condition) { ... } else { return; } 改为 if (!condition) return; ...',
            fixSuggestion: {
              title: '使用提前返回模式',
              description: '提前返回（Guard Clause）可以减少嵌套，提高代码可读性。将错误检查和边界条件提前返回。',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '识别保护条件', detail: '找出用于错误检查或边界条件的 if 语句' },
                { step: 2, action: '提前返回', detail: '将这些条件改为提前返回，避免 else 分支' },
                { step: 3, action: '扁平化代码', detail: '移除不必要的嵌套，让主逻辑更清晰' },
              ],
              codeExample: {
                before: `function process(data) {
  if (data.valid) {
    // 主逻辑
  } else {
    return;
  }
}`,
                after: `function process(data) {
  if (!data.valid) return;
  // 主逻辑
}`,
              },
              references: [
                { title: 'Guard Clause Pattern', url: 'https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html' },
                { title: 'Clean Code - Early Return', url: 'https://www.oreilly.com/library/view/clean-code-a/9780136083238/' },
              ],
            },
          });
          return;
        }

        // 模式2: if (condition) { return; } else { ... }
        // 可以改为：if (condition) return;
        if (alternate && !consequentHasReturn && alternateHasReturn) {
          const line = ifStmt.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/prefer-early-return',
            severity: 'info' as IssueSeverity,
            message: 'else 分支中只有 return 语句，可以考虑提前返回，减少嵌套。',
            suggestion: '将 else 块中的 return 放到 if 后面。例如：if (condition) { ... } else { return; } 改为 if (condition) { ... } return;',
            fixSuggestion: {
              title: '使用提前返回模式',
              description: '提前返回（Guard Clause）可以减少嵌套，提高代码可读性。将错误检查和边界条件提前返回。',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '识别保护条件', detail: '找出用于错误检查或边界条件的 if 语句' },
                { step: 2, action: '提前返回', detail: '将这些条件改为提前返回，避免 else 分支' },
                { step: 3, action: '扁平化代码', detail: '移除不必要的嵌套，让主逻辑更清晰' },
              ],
              codeExample: {
                before: `function process(data) {
  if (data.valid) {
    // 主逻辑
  } else {
    return;
  }
}`,
                after: `function process(data) {
  if (!data.valid) return;
  // 主逻辑
}`,
              },
              references: [
                { title: 'Guard Clause Pattern', url: 'https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html' },
                { title: 'Clean Code - Early Return', url: 'https://www.oreilly.com/library/view/clean-code-a/9780136083238/' },
              ],
            },
          });
          return;
        }

        // 模式3: if (condition) { return; } // 后续代码
        // 可以考虑提前返回
        if (!alternate && consequentHasReturn) {
          const line = ifStmt.loc?.start?.line ?? 1;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/prefer-early-return',
            severity: 'info' as IssueSeverity,
            message: 'if 分支中包含 return 语句，且后续还有代码。可以考虑将 return 放在 if 后面，作为 guard clause。',
            suggestion: '将 if 作为 guard clause：if (condition) return; // 后续代码',
            fixSuggestion: {
              title: '使用提前返回模式',
              description: '提前返回（Guard Clause）可以减少嵌套，提高代码可读性。将错误检查和边界条件提前返回。',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '识别保护条件', detail: '找出用于错误检查或边界条件的 if 语句' },
                { step: 2, action: '提前返回', detail: '将这些条件改为提前返回，避免 else 分支' },
                { step: 3, action: '扁平化代码', detail: '移除不必要的嵌套，让主逻辑更清晰' },
              ],
              codeExample: {
                before: `function process(data) {
  if (data.valid) {
    // 主逻辑
  } else {
    return;
  }
}`,
                after: `function process(data) {
  if (!data.valid) return;
  // 主逻辑
}`,
              },
              references: [
                { title: 'Guard Clause Pattern', url: 'https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html' },
                { title: 'Clean Code - Early Return', url: 'https://www.oreilly.com/library/view/clean-code-a/9780136083238/' },
              ],
            },
          });
        }
      },

      ReturnStatement(node: BaseASTNode) {
        const returnStmt = node as ReturnStatement;

        // 获取 return 语句所在的函数
        const functionBody = getFunctionBody(returnStmt);
        if (!functionBody) return;

        // 检查 return 语句在函数体中的位置
        const returnIndex = functionBody.body.indexOf(returnStmt);
        if (returnIndex === -1) {
          // return 不在函数体的直接子节点中（可能在块内）
          return;
        }

        // 如果 return 不是最后一条语句，则有问题
        if (returnIndex < functionBody.body.length - 1) {
          const line = returnStmt.loc?.start?.line ?? 1;
          const statementsAfter = functionBody.body.length - returnIndex - 1;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/prefer-early-return',
            severity: 'error' as IssueSeverity,
            message: `return 语句后面还有 ${statementsAfter} 行代码永远不会执行，这是死代码。`,
            suggestion: '删除 return 语句后的代码，或者将 return 移到函数末尾。',
            fixSuggestion: {
              title: '使用提前返回模式',
              description: '提前返回（Guard Clause）可以减少嵌套，提高代码可读性。将错误检查和边界条件提前返回。',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '识别保护条件', detail: '找出用于错误检查或边界条件的 if 语句' },
                { step: 2, action: '提前返回', detail: '将这些条件改为提前返回，避免 else 分支' },
                { step: 3, action: '扁平化代码', detail: '移除不必要的嵌套，让主逻辑更清晰' },
              ],
              codeExample: {
                before: `function process(data) {
  if (data.valid) {
    // 主逻辑
  } else {
    return;
  }
}`,
                after: `function process(data) {
  if (!data.valid) return;
  // 主逻辑
}`,
              },
              references: [
                { title: 'Guard Clause Pattern', url: 'https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html' },
                { title: 'Clean Code - Early Return', url: 'https://www.oreilly.com/library/view/clean-code-a/9780136083238/' },
              ],
            },
          });
        }
      },
    };
  },
};
