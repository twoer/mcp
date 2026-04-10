import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, FunctionNode, BlockStatement, Expression } from '../../ast-types.js';

/**
 * 计算函数体的圈复杂度
 * 使用访问者模式单次遍历，避免重复计数
 *
 * 圈复杂度计算规则（基于 McCabe）：
 * - 基础复杂度 = 1
 * - 每个控制流分支 +1（if, for, while, switch case, 三元运算符）
 * - 逻辑运算符 && || +1
 * - switch case 的 default 不计数
 */
function computeComplexity(body: BlockStatement | Expression): number {
  let complexity = 1; // 基础复杂度

  // 定义访问者来遍历 AST 并计算复杂度
  const visitor = {
    postVisit(node: BaseASTNode): void {
      // 控制流语句
      if (node.type === 'IfStatement') {
        complexity += 1;
        // else 分支不计入额外复杂度（已在 if 中计算）
      } else if (node.type === 'ForStatement' ||
                 node.type === 'ForInStatement' ||
                 node.type === 'ForOfStatement' ||
                 node.type === 'WhileStatement' ||
                 node.type === 'DoWhileStatement') {
        complexity += 1;
      } else if (node.type === 'SwitchCase') {
        // switch case 的 default 不计数
        const hasTest = (node as any).test !== null;
        if (hasTest) {
          complexity += 1;
        }
      } else if (node.type === 'ConditionalExpression') {
        // 三元运算符
        complexity += 1;
      } else if (node.type === 'LogicalExpression') {
        // 逻辑运算符 && ||
        const operator = (node as any).operator;
        if (operator === '&&' || operator === '||') {
          complexity += 1;
        }
      }

      // 递归访问子节点
      const skipKeys = new Set(['parent', 'loc', 'range', 'comments', 'tokens']);
      for (const key of Object.keys(node)) {
        if (skipKeys.has(key)) continue;
        const value = (node as any)[key];
        if (!value) continue;

        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child === 'object' && typeof child.type === 'string') {
              this.postVisit(child);
            }
          }
        } else if (typeof value === 'object' && typeof value.type === 'string') {
          this.postVisit(value);
        }
      }
    }
  };

  visitor.postVisit(body as BaseASTNode);
  return complexity;
}

export const complexFunctionRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/complex-function',
  create(context: AstRuleContext) {
    const maxComplexity = (context.ruleOptions?.maxComplexity as number | undefined) ?? 10;

    function checkFunction(node: FunctionNode): void {
      const body = node.body;
      if (!body) return;

      // 箭头函数简写体：() => value
      if (body.type !== 'BlockStatement') {
        // 箭头函数简写体的复杂度通常较低，可以跳过或单独计算
        return;
      }

      const complexity = computeComplexity(body);
      if (complexity <= maxComplexity) return;

      const line = node.loc?.start?.line ?? 1;
      context.report({
        line,
        category: 'maintainability',
        ruleId: 'maintainability/complex-function',
        severity: 'warning' as IssueSeverity,
        message: `函数圈复杂度为 ${complexity}，超过限制 ${maxComplexity}，应考虑重构。`,
        suggestion: '考虑将复杂逻辑拆分为多个小函数，或使用策略模式/状态模式来简化控制流。',
        fixSuggestion: {
          title: '降低函数复杂度',
          description: '圈复杂度过高意味着函数有太多的控制流分支，难以测试和维护。应简化逻辑或拆分函数。',
          fixType: 'guided' as const,
          steps: [
            { step: 1, action: '识别复杂分支', detail: '找出函数中的 if/else、switch、循环等控制流语句' },
            { step: 2, action: '提取条件逻辑', detail: '将复杂的条件判断提取为独立的函数或使用策略模式' },
            { step: 3, action: '简化嵌套', detail: '使用提前返回（guard clause）减少嵌套层级' },
          ],
          codeExample: {
            before: `function calculate(type, value) {
  if (type === 'A') {
    if (value > 100) return value * 0.9;
    else return value * 0.95;
  } else if (type === 'B') {
    // 更多分支...
  }
}`,
            after: `function calculate(type, value) {
  const strategies = {
    A: calculateTypeA,
    B: calculateTypeB
  };
  return strategies[type](value);
}`,
          },
          references: [
            { title: 'Cyclomatic Complexity', url: 'https://en.wikipedia.org/wiki/Cyclomatic_complexity' },
            { title: 'Refactoring - Simplifying Conditional Logic', url: 'https://refactoring.com/catalog/' },
          ],
        },
      });
    }

    return {
      FunctionDeclaration(node: BaseASTNode) {
        checkFunction(node as FunctionNode);
      },
      FunctionExpression(node: BaseASTNode) {
        checkFunction(node as FunctionNode);
      },
      ArrowFunctionExpression(node: BaseASTNode) {
        checkFunction(node as FunctionNode);
      },
      MethodDefinition(node: BaseASTNode) {
        const methodDef = node as { value?: FunctionNode };
        if (methodDef.value) {
          checkFunction(methodDef.value);
        }
      },
    };
  },
};
