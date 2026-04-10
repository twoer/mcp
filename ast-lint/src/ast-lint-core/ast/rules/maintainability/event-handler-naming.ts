import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { 
  BaseASTNode, 
  Identifier, 
  VDirective, 
  VDirectiveKey,
  VIdentifier,
  FunctionDeclaration,
  VariableDeclarator,
  Property,
  MethodDefinition,
  CallExpression,
  MemberExpression
} from '../../ast-types.js';

/**
 * 检测事件处理函数的命名规范
 * 所有事件处理方法都应该以 handle 开头命名
 */
export const eventHandlerNamingRule: RuleDefinition<AstRuleContext> = {
  id: 'maintainability/event-handler-naming',
  create(context: AstRuleContext) {
    const prefix = (context.ruleOptions?.prefix as string | undefined) ?? 'handle';
    const eventNames = (context.ruleOptions?.eventNames as string[] | undefined) ?? [
      'click',
      'change',
      'submit',
      'input',
      'focus',
      'blur',
      'keydown',
      'keyup',
      'keypress',
      'mouseenter',
      'mouseleave',
      'mousedown',
      'mouseup',
      'scroll',
      'resize',
      'load',
      'unload',
      'error',
    ];

    /**
     * 检查函数名是否以指定前缀开头
     */
    function isValidHandlerName(name: string): boolean {
      if (!name) return false;
      return name.toLowerCase().startsWith(prefix.toLowerCase());
    }

    /**
     * 从函数名中提取事件名（去除前缀）
     */
    function extractEventName(functionName: string): string {
      if (!functionName) return '';
      const lowerName = functionName.toLowerCase();
      if (lowerName.startsWith(prefix.toLowerCase())) {
        return lowerName.substring(prefix.length);
      }
      return '';
    }

    /**
     * 检查是否是事件处理函数名（仅检查 on 前缀和直接的事件名）
     */
    function isEventHandlerName(name: string): boolean {
      if (!name) return false;
      const lowerName = name.toLowerCase();
      
      // 检查是否以事件名开头（如 onClick, onInput）
      if (lowerName.startsWith('on')) {
        const eventPart = lowerName.substring(2);
        return eventNames.some(event => eventPart === event || eventPart.startsWith(event));
      }

      // 不再检查直接事件名和包含事件名，减少误报
      return false;
    }

    return {
      // Vue 事件处理：@click="handleClick" 或 @click="onClick"
      VDirective(node: BaseASTNode) {
        const vNode = node as VDirective;
        const key = vNode.key as VDirectiveKey;
        // 运行时类型检查，提高健壮性
        if (!key || key.type !== 'VDirectiveKey' || !key.name) return;

        // 提取指令名称（v-on, v-bind 等）
        const directiveName = (key.name as VIdentifier).name ?? '';

        // 只检查事件指令（v-on 或简写 @）
        // 对于 @click，directiveName 是 'on'，实际事件名在 key.argument.name 中
        if (directiveName !== 'on') return;

        // 获取实际的事件名
        const argument = key.argument;
        let eventName = '';
        if (argument && argument.type === 'VIdentifier') {
          eventName = (argument as VIdentifier).name ?? '';
        }

        // 检查是否是关注的事件
        if (!eventName || !eventNames.includes(eventName)) return;
        
        const value = vNode.value;
        if (!value || !value.expression) return;

        const expr = value.expression as BaseASTNode;
        let handlerName: string | undefined;

        // 函数调用：@click="handleClick()"
        if (expr.type === 'CallExpression') {
          const callExpr = expr as CallExpression;
          const callee = callExpr.callee;
          if (callee.type === 'Identifier') {
            handlerName = (callee as Identifier).name;
          } else if (callee.type === 'MemberExpression') {
            const memberExpr = callee as MemberExpression;
            const property = memberExpr.property;
            if (property.type === 'Identifier') {
              handlerName = (property as Identifier).name;
            }
          }
        }
        // 函数引用：@click="handleClick"
        else if (expr.type === 'Identifier') {
          handlerName = (expr as Identifier).name;
        }
        // 成员表达式：@click="methods.handleClick"
        else if (expr.type === 'MemberExpression') {
          const memberExpr = expr as MemberExpression;
          const property = memberExpr.property;
          if (property.type === 'Identifier') {
            handlerName = (property as Identifier).name;
          }
        }

        // 只有当处理函数名不符合规范时才报告
        if (handlerName && !isValidHandlerName(handlerName)) {
          const line = node.loc?.start?.line ?? 1;
          const suggestedName = `${prefix}${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/event-handler-naming',
            severity: 'warning' as IssueSeverity,
            message: `Vue 事件处理函数 "${handlerName}" 应该以 "${prefix}" 开头命名。`,
            suggestion: `建议改为 "${suggestedName}"，例如：@${eventName}="${suggestedName}"。`,
            fixSuggestion: {
              title: '规范事件处理函数命名',
              description: '使用统一的命名前缀，提高代码可读性',
              fixType: 'safe' as const,
              codeExample: {
                before: `<button @click="onClick">点击</button>

<script setup>
const onClick = () => {
  console.log('clicked');
};
</script>`,
                after: `<button @click="handleClick">点击</button>

<script setup>
const handleClick = () => {
  console.log('clicked');
};
</script>`,
              },
              references: [
                { title: 'Vue.js Style Guide', url: 'https://vuejs.org/style-guide/' },
              ],
            },
          });
        }
      },

      // JavaScript/TypeScript 中的事件处理函数
      FunctionDeclaration(node: BaseASTNode) {
        const funcNode = node as FunctionDeclaration;
        const id = funcNode.id;
        if (!id || id.type !== 'Identifier') return;

        const functionName = (id as Identifier).name;
        if (isEventHandlerName(functionName) && !isValidHandlerName(functionName)) {
          const line = node.loc?.start?.line ?? 1;
          const eventName = extractEventName(functionName) || functionName.replace(/^on/, '').toLowerCase();
          const suggestedName = `${prefix}${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/event-handler-naming',
            severity: 'warning' as IssueSeverity,
            message: `事件处理函数 "${functionName}" 应该以 "${prefix}" 开头命名。`,
            suggestion: `建议改为 "${suggestedName}"。`,
          });
        }
      },

      // 箭头函数和函数表达式
      VariableDeclarator(node: BaseASTNode) {
        const varNode = node as VariableDeclarator;
        const id = varNode.id;
        const init = varNode.init;

        if (!id || id.type !== 'Identifier') return;
        if (!init) return;

        const variableName = (id as Identifier).name;
        if (!variableName) return;
        
        // 只检查明确是事件处理函数的情况
        if (!isEventHandlerName(variableName) || isValidHandlerName(variableName)) return;
        
        // 检查是否是函数赋值
        const isFunction = 
          init.type === 'FunctionExpression' ||
          init.type === 'ArrowFunctionExpression';

        if (isFunction) {
          const line = node.loc?.start?.line ?? 1;
          const eventName = extractEventName(variableName) || variableName.replace(/^on/, '').toLowerCase();
          const suggestedName = `${prefix}${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/event-handler-naming',
            severity: 'warning' as IssueSeverity,
            message: `事件处理函数 "${variableName}" 应该以 "${prefix}" 开头命名。`,
            suggestion: `建议改为 "${suggestedName}"。`,
          });
        }
      },

      // 对象方法：methods: { onClick() {} }
      Property(node: BaseASTNode) {
        const propNode = node as Property;
        const key = propNode.key;
        if (!key) return;

        let methodName: string | undefined;
        if (key.type === 'Identifier') {
          methodName = (key as Identifier).name;
        } else if (key.type === 'Literal') {
          const literalValue = (key as { value?: unknown }).value;
          if (typeof literalValue === 'string') {
            methodName = literalValue;
          }
        }

        if (!methodName) return;

        // 只检查明确是事件处理函数的情况
        if (!isEventHandlerName(methodName) || isValidHandlerName(methodName)) return;
        
        const value = propNode.value;
        // 检查值是否是函数
        const isFunction = 
          value && (
            value.type === 'FunctionExpression' ||
            value.type === 'ArrowFunctionExpression'
          );

        if (isFunction) {
          const line = node.loc?.start?.line ?? 1;
          const eventName = extractEventName(methodName) || methodName.replace(/^on/, '').toLowerCase();
          const suggestedName = `${prefix}${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
          context.report({
            line,
            category: 'maintainability',
            ruleId: 'maintainability/event-handler-naming',
            severity: 'warning' as IssueSeverity,
            message: `事件处理函数 "${methodName}" 应该以 "${prefix}" 开头命名。`,
            suggestion: `建议改为 "${suggestedName}"。`,
          });
        }
      },

      // 类方法：class Component { onClick() {} }
      MethodDefinition(node: BaseASTNode) {
        const methodNode = node as MethodDefinition;
        const key = methodNode.key;
        if (!key) return;

        let methodName: string | undefined;
        if (key.type === 'Identifier') {
          methodName = (key as Identifier).name;
        } else if (key.type === 'Literal') {
          const literalValue = (key as { value?: unknown }).value;
          if (typeof literalValue === 'string') {
            methodName = literalValue;
          }
        }

        if (!methodName) return;

        // 只检查明确是事件处理函数的情况
        if (!isEventHandlerName(methodName) || isValidHandlerName(methodName)) return;
        
        const line = methodNode.loc?.start?.line ?? 1;
        const eventName = extractEventName(methodName) || methodName.replace(/^on/, '').toLowerCase();
        const suggestedName = `${prefix}${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;
        context.report({
          line,
          category: 'maintainability',
          ruleId: 'maintainability/event-handler-naming',
          severity: 'warning' as IssueSeverity,
          message: `事件处理函数 "${methodName}" 应该以 "${prefix}" 开头命名。`,
          suggestion: `建议改为 "${suggestedName}"。`,
        });
      },
    };
  },
};

