import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  Identifier,
  VariableDeclarator,
  VariableDeclaration,
  Property,
  FunctionDeclaration,
  ArrowFunctionExpression,
  FunctionExpression,
} from '../../ast-types.js';

/**
 * 检测命名一致性规范
 * - 变量/参数应使用 camelCase
 * - 常量使用 UPPER_SNAKE_CASE 是合法的
 * - 排除合法使用场景（如 API 响应字段解构）
 */
export const namingConventionRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/naming-convention',
  create(context: AstRuleContext) {
    /**
     * 检查是否是 snake_case 命名
     * snake_case 定义：至少包含一个下划线，且全小写
     */
    function isSnakeCase(name: string): boolean {
      if (!name) return false;
      // 必须包含至少一个下划线分隔的小写单词
      return /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*)+$/.test(name);
    }

    /**
     * 检查是否是 UPPER_SNAKE_CASE（常量命名）
     */
    function isUpperSnakeCase(name: string): boolean {
      if (!name) return false;
      return /^[A-Z][A-Z0-9]*(_[A-Z][A-Z0-9]*)*$/.test(name);
    }

    /**
     * 检查是否是 PascalCase
     */
    function isPascalCase(name: string): boolean {
      if (!name) return false;
      return /^[A-Z][a-zA-Z0-9]*$/.test(name);
    }

    /**
     * 将 snake_case 转换为 camelCase
     */
    function toCamelCase(name: string): string {
      return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    /**
     * 检查变量声明
     */
    function checkVariableDeclarator(node: BaseASTNode) {
      const varNode = node as VariableDeclarator;
      const id = varNode.id;

      if (!id) return;

      // 只处理简单标识符（不是解构）
      if (id.type !== 'Identifier') return;

      const name = (id as Identifier).name;
      if (!name) return;

      // 跳过常量（const 声明的 UPPER_SNAKE_CASE 是合法的）
      const parent = node.parent as VariableDeclaration;
      if (parent?.type === 'VariableDeclaration') {
        if (parent.kind === 'const' && isUpperSnakeCase(name)) {
          return;
        }
      }

      // 跳过 PascalCase（通常是类/组件/类型）
      if (isPascalCase(name)) {
        return;
      }

      // 检查是否是 snake_case
      if (isSnakeCase(name)) {
        const line = node.loc?.start?.line ?? 1;
        const suggestedName = toCamelCase(name);
        context.report({
          line,
          category: 'maintainability',
          ruleId: 'maintainability/naming-convention',
          severity: 'warning' as IssueSeverity,
          message: `变量 "${name}" 使用了 snake_case 命名，应使用 camelCase。`,
          suggestion: `建议改为 "${suggestedName}"。`,
          fixSuggestion: {
            title: '遵循命名规范',
            description: '使用 camelCase 命名变量和函数，提高代码一致性',
            fixType: 'guided' as const,
            steps: [
              { step: 1, action: '识别命名问题', detail: '找出使用 snake_case 的变量' },
              { step: 2, action: '转换为 camelCase', detail: '将下划线分隔改为驼峰命名' },
              { step: 3, action: '更新所有引用', detail: '确保所有使用该变量的地方都已更新' },
            ],
            codeExample: {
              before: `const user_name = 'John';
const user_age = 25;`,
              after: `const userName = 'John';
const userAge = 25;`,
            },
            references: [
              { title: 'JavaScript Style Guide', url: 'https://google.github.io/styleguide/jsguide.html#naming' },
            ],
          },
        });
      }
    }

    /**
     * 检查函数声明
     */
    function checkFunctionDeclaration(node: BaseASTNode) {
      const funcNode = node as FunctionDeclaration;
      const id = funcNode.id;

      if (!id || id.type !== 'Identifier') return;

      const name = (id as Identifier).name;
      if (!name) return;

      // 跳过 PascalCase（通常是类/组件）
      if (isPascalCase(name)) {
        return;
      }

      // 检查是否是 snake_case
      if (isSnakeCase(name)) {
        const line = node.loc?.start?.line ?? 1;
        const suggestedName = toCamelCase(name);
        context.report({
          line,
          category: 'maintainability',
          ruleId: 'maintainability/naming-convention',
          severity: 'warning' as IssueSeverity,
          message: `函数 "${name}" 使用了 snake_case 命名，应使用 camelCase。`,
          suggestion: `建议改为 "${suggestedName}"。`,
        });
      }

      // 检查参数
      checkFunctionParams(funcNode.params);
    }

    /**
     * 检查箭头函数/函数表达式
     */
    function checkFunctionExpression(node: BaseASTNode) {
      const funcNode = node as ArrowFunctionExpression | FunctionExpression;

      // 检查参数
      checkFunctionParams(funcNode.params);
    }

    /**
     * 检查函数参数
     */
    function checkFunctionParams(params: BaseASTNode[]) {
      for (const param of params) {
        if (param.type === 'Identifier') {
          const name = (param as Identifier).name;
          if (name && isSnakeCase(name) && !isUpperSnakeCase(name)) {
            const line = param.loc?.start?.line ?? 1;
            const suggestedName = toCamelCase(name);
            context.report({
              line,
              category: 'maintainability',
              ruleId: 'maintainability/naming-convention',
              severity: 'warning' as IssueSeverity,
              message: `参数 "${name}" 使用了 snake_case 命名，应使用 camelCase。`,
              suggestion: `建议改为 "${suggestedName}"。`,
            });
          }
        }
        // 处理解构参数中的标识符
        else if (param.type === 'ObjectPattern') {
          checkObjectPattern(param);
        }
      }
    }

    /**
     * 检查对象解构模式
     * 解构中的属性名通常来自 API 响应，snake_case 是合法的
     * 但重命名的变量应该使用 camelCase
     */
    function checkObjectPattern(node: BaseASTNode) {
      const properties = (node as BaseASTNode & { properties?: BaseASTNode[] }).properties ?? [];
      for (const prop of properties) {
        if (prop.type === 'Property') {
          const property = prop as Property;
          const value = property.value;

          // 如果是重命名：{ api_field: localField }
          if (value && value.type === 'Identifier') {
            const name = (value as Identifier).name;
            if (name && isSnakeCase(name) && !isUpperSnakeCase(name)) {
              const line = value.loc?.start?.line ?? 1;
              const suggestedName = toCamelCase(name);
              context.report({
                line,
                category: 'maintainability',
                ruleId: 'maintainability/naming-convention',
                severity: 'warning' as IssueSeverity,
                message: `解构变量 "${name}" 使用了 snake_case 命名，应使用 camelCase。`,
                suggestion: `建议改为 "${suggestedName}"。`,
              });
            }
          }
          // 嵌套解构 - value might be ObjectPattern in destructuring context
          else if (value) {
            const valueAsNode = value as BaseASTNode;
            if (valueAsNode.type === 'ObjectPattern') {
              checkObjectPattern(valueAsNode);
            }
          }
        }
        // Rest 元素
        else if (prop.type === 'RestElement') {
          const argument = (prop as BaseASTNode & { argument?: BaseASTNode }).argument;
          if (argument && argument.type === 'Identifier') {
            const name = (argument as Identifier).name;
            if (name && isSnakeCase(name) && !isUpperSnakeCase(name)) {
              const line = argument.loc?.start?.line ?? 1;
              const suggestedName = toCamelCase(name);
              context.report({
                line,
                category: 'maintainability',
                ruleId: 'maintainability/naming-convention',
                severity: 'warning' as IssueSeverity,
                message: `Rest 变量 "${name}" 使用了 snake_case 命名，应使用 camelCase。`,
                suggestion: `建议改为 "${suggestedName}"。`,
              });
            }
          }
        }
      }
    }

    return {
      VariableDeclarator: checkVariableDeclarator,
      FunctionDeclaration: checkFunctionDeclaration,
      ArrowFunctionExpression: checkFunctionExpression,
      FunctionExpression: checkFunctionExpression,
    };
  },
};
