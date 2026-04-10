import type { RuleVisitor } from './types.js';
import type { BaseASTNode } from './ast-types.js';
import type { AstRuleContext } from './rule-registry.js';

/**
 * 遍历 AST 节点并应用规则访问器
 */
export function traverseAst(
  node: BaseASTNode,
  visitor: RuleVisitor,
  context: AstRuleContext,
  parent: BaseASTNode | null,
  visited?: WeakSet<object>,
): void {
  if (!node || typeof node.type !== 'string') return;

  // 循环引用防护
  if (!visited) {
    visited = new WeakSet();
  }
  if (visited.has(node)) return;
  visited.add(node);

  // 设置父节点引用
  if (parent) {
    (node as BaseASTNode).parent = parent;
  }

  const handler = visitor[node.type];
  if (handler) {
    handler(node, context);
  }

  // 跳过不应该遍历的属性，防止循环引用
  const skipKeys = new Set(['parent', 'loc', 'range', 'comments', 'tokens']);

  for (const key of Object.keys(node)) {
    if (skipKeys.has(key)) continue;

    const value = (node as unknown as Record<string, unknown>)[key];

    if (!value) continue;

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof (child as BaseASTNode).type === 'string') {
          traverseAst(child as BaseASTNode, visitor, context, node, visited);
        }
      }
    } else if (value && typeof value === 'object' && typeof (value as BaseASTNode).type === 'string') {
      traverseAst(value as BaseASTNode, visitor, context, node, visited);
    }
  }
}

