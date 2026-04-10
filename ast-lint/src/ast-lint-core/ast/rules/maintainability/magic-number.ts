import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, Literal, MemberExpression, BinaryExpression, VExpressionContainer } from '../../ast-types.js';

/**
 * 检测魔法数字（未命名的数字字面量）
 * 魔法数字应该提取为常量，提高代码可读性
 */
export const magicNumberRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/magic-number',
  create(context: AstRuleContext) {
    // 扩展默认允许的数字列表，减少噪音
    const allowedNumbers = (context.ruleOptions?.allowedNumbers as number[] | undefined) ?? [
      0, 1, -1, 2, 10, 100, 1000,
      // 常见的时间相关数字
      24, 60, 3600, 1024,
      // 常见的百分比
      50, 25, 75,
    ];
    const ignorePatterns = (context.ruleOptions?.ignorePatterns as string[] | undefined) ?? [
      'index',
      'length',
      'size',
      'count',
      'width',
      'height',
    ];

    /**
     * 检查数字是否在允许列表中
     */
    function isAllowedNumber(value: number): boolean {
      return allowedNumbers.includes(value);
    }

    /**
     * 检查节点是否在 Vue 模板表达式中
     * Vue 模板中的数字字面量（如 :duration="200"）通常不需要提取为常量
     */
    function isInVueTemplate(node: BaseASTNode): boolean {
      let current: BaseASTNode | undefined = node;
      while (current) {
        if (current.type === 'VExpressionContainer') {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    /**
     * 检查上下文是否应该忽略（如数组索引、长度等）
     */
    function shouldIgnore(node: Literal): boolean {
      // Vue 模板中的数字字面量应该忽略
      if (isInVueTemplate(node)) {
        return true;
      }

      const parent = node.parent;
      if (!parent) return false;

      // 数组索引访问 arr[0]
      if (parent.type === 'MemberExpression') {
        const memberExpr = parent as MemberExpression;
        if (memberExpr.property === node) {
          return true;
        }
      }

      // 数组长度 arr.length
      if (parent.type === 'MemberExpression') {
        const memberExpr = parent as MemberExpression;
        if (memberExpr.property && 'name' in memberExpr.property) {
          const propName = (memberExpr.property as { name: string }).name.toLowerCase();
          if (ignorePatterns.some(pattern => propName.includes(pattern))) {
            return true;
          }
        }
      }

      // 比较操作中的常见值
      if (parent.type === 'BinaryExpression') {
        const binaryExpr = parent as BinaryExpression;
        const operator = binaryExpr.operator;
        if (['===', '!==', '==', '!='].includes(operator)) {
          // 与 0 或 1 的比较通常是合理的
          if (node.value === 0 || node.value === 1) {
            return true;
          }
        }
      }

      return false;
    }

    return {
      Literal(node: BaseASTNode) {
        const literalNode = node as Literal;
        // 只检查数字字面量
        if (typeof literalNode.value !== 'number') return;

        // 跳过允许的数字
        if (isAllowedNumber(literalNode.value)) return;

        // 检查是否应该忽略
        if (shouldIgnore(literalNode)) return;

        const line = literalNode.loc?.start?.line ?? 1;
        context.report({
          line,
          category: 'maintainability',
          ruleId: 'maintainability/magic-number',
          severity: 'info' as IssueSeverity,  // 从 warning 降为 info
          message: `检测到魔法数字 ${literalNode.value}，建议提取为有意义的常量。`,
          suggestion: `将 ${literalNode.value} 提取为命名常量，例如：const MAX_RETRY_COUNT = ${literalNode.value};`,
          fixSuggestion: {
            title: '提取魔法数字为常量',
            description: '硬编码的数字缺少语义，建议提取为命名常量以提高代码可读性和可维护性。',
            fixType: 'guided',
            steps: [
              {
                step: 1,
                action: '理解数字含义',
                detail: `这个 ${literalNode.value} 代表什么？延迟时间？阈值？最大值？`,
              },
              {
                step: 2,
                action: '提取为常量',
                code: `const CONSTANT_NAME = ${literalNode.value}`,
                detail: '在文件顶部或配置文件中定义常量',
              },
              {
                step: 3,
                action: '替换魔法数字',
                detail: '将所有相同的魔法数字替换为常量名',
              },
            ],
            codeExample: {
              before: `setTimeout(() => { ... }, ${literalNode.value})`,
              after: `const DELAY_MS = ${literalNode.value}\nsetTimeout(() => { ... }, DELAY_MS)`,
            },
            references: [
              {
                title: 'Clean Code - 避免魔法数字',
                url: 'https://refactoring.guru/smells/magic-numbers',
              },
              {
                title: 'ESLint - no-magic-numbers',
                url: 'https://eslint.org/docs/latest/rules/no-magic-numbers',
              },
            ],
          },
        });
      },
    };
  },
};

