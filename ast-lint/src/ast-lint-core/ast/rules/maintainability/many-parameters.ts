import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, FunctionNode } from '../../ast-types.js';

/**
 * 检测函数参数过多的情况
 * 参数过多通常意味着函数职责不清晰，需要注释说明或重构
 */
export const manyParametersRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/many-parameters',
  create(context: AstRuleContext) {
    const maxParams = (context.ruleOptions?.maxParams as number | undefined) ?? 4;
    const requireComment = (context.ruleOptions?.requireComment as boolean | undefined) ?? true;

    /**
     * 检查函数节点前是否有注释
     * 通过检查 AST 节点的 leadingComments 属性
     */
    function hasComment(node: BaseASTNode): boolean {
      // 检查 leadingComments（函数前的注释）
      if (node.leadingComments && Array.isArray(node.leadingComments) && node.leadingComments.length > 0) {
        return true;
      }

      // 检查父节点的注释（某些情况下注释可能在父节点上）
      const parent = node.parent;
      if (parent && parent.leadingComments && Array.isArray(parent.leadingComments) && parent.leadingComments.length > 0) {
        return true;
      }

      return false;
    }

    /**
     * 检查函数参数数量
     */
    function checkFunction(node: FunctionNode): void {
      const params = node.params || [];
      if (params.length <= maxParams) return;

      const line = node.loc?.start?.line ?? 1;
      const paramCount = params.length;

      // 如果需要注释但函数没有注释
      if (requireComment && !hasComment(node)) {
        context.report({
          line,
          category: 'maintainability',
          ruleId: 'maintainability/many-parameters',
          severity: 'warning' as IssueSeverity,
          message: `函数有 ${paramCount} 个参数，超过限制 ${maxParams} 个。参数过多时建议添加注释说明每个参数的用途，或考虑重构为对象参数。`,
          suggestion: `添加 JSDoc 注释说明参数用途，或考虑将多个参数合并为对象参数。`,
          fixSuggestion: {
            title: '使用对象参数',
            description: '将多个参数合并为一个对象参数，提高可读性',
            fixType: 'guided' as const,
            steps: [
              { step: 1, action: '创建参数对象', detail: '将多个参数合并为一个对象' },
              { step: 2, action: '更新函数签名', detail: '修改函数定义使用对象参数' },
              { step: 3, action: '更新调用处', detail: '修改所有调用该函数的地方' },
            ],
            codeExample: {
              before: `function createUser(name, age, email, phone, address) {
  // ...
}

createUser('John', 25, 'john@example.com', '123456', 'Street 1');`,
              after: `function createUser({ name, age, email, phone, address }) {
  // ...
}

createUser({
  name: 'John',
  age: 25,
  email: 'john@example.com',
  phone: '123456',
  address: 'Street 1'
});`,
            },
            references: [
              { title: 'Clean Code', url: 'https://github.com/ryanmcdermott/clean-code-javascript#functions' },
            ],
          },
        });
      } else if (!requireComment) {
        // 即使不需要注释，参数过多也应该警告
        context.report({
          line,
          category: 'maintainability',
          ruleId: 'maintainability/many-parameters',
          severity: 'warning' as IssueSeverity,
          message: `函数有 ${paramCount} 个参数，超过推荐数量 ${maxParams} 个，建议重构为对象参数或拆分函数。`,
          suggestion: '考虑将多个参数合并为对象参数，或拆分函数以降低复杂度。',
        });
      }
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
