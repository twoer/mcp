import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, FunctionNode } from '../../ast-types.js';

/**
 * 检测函数过长的情况
 * 函数过长通常意味着职责过多，应该拆分
 */
export const longFunctionRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/long-function',
  create(context: AstRuleContext) {
    const maxLines = (context.ruleOptions?.maxLines as number | undefined) ?? 50;

    function checkFunction(node: FunctionNode): void {
      const loc = node.loc;
      if (!loc || !loc.end || !loc.start) return;

      const lineCount = loc.end.line - loc.start.line + 1;
      if (lineCount <= maxLines) return;

      const line = loc.start.line;
      context.report({
        line,
        category: 'maintainability',
        ruleId: 'maintainability/long-function',
        severity: 'warning' as IssueSeverity,
        message: `函数长度为 ${lineCount} 行，超过限制 ${maxLines} 行，应考虑拆分。`,
        suggestion: '将函数拆分为多个小函数，每个函数只做一件事。考虑使用"抽取方法"重构模式。',
        fixSuggestion: {
          title: '拆分过长函数',
          description: '函数过长通常意味着职责过多，难以理解和维护。应将其拆分为多个小函数。',
          fixType: 'guided' as const,
          steps: [
            { step: 1, action: '识别独立逻辑块', detail: '找出函数中可以独立出来的逻辑块，如数据验证、数据转换、业务逻辑等' },
            { step: 2, action: '提取为独立函数', detail: '将每个逻辑块提取为独立的函数，给予清晰的命名' },
            { step: 3, action: '简化主函数', detail: '主函数只保留高层次的流程控制，调用提取出的小函数' },
          ],
          codeExample: {
            before: `function processUser(user) {
  // 50+ 行代码
  // 验证、转换、保存、通知...
}`,
            after: `function processUser(user) {
  validateUser(user);
  const transformed = transformUserData(user);
  saveUser(transformed);
  notifyUser(user);
}`,
          },
          references: [
            { title: 'Clean Code - Functions', url: 'https://www.oreilly.com/library/view/clean-code-a/9780136083238/' },
            { title: 'Refactoring - Extract Method', url: 'https://refactoring.com/catalog/extractFunction.html' },
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
