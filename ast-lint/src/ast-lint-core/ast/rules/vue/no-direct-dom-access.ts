import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type { BaseASTNode, CallExpression, Identifier, MemberExpression } from '../../ast-types.js';

/**
 * 检测 Vue 组件中直接操作 DOM 的行为
 *
 * 直接操作 DOM 违反 Vue 响应式原则，可能导致：
 * 1. 状态与视图不一致
 * 2. Vue 的虚拟 DOM diff 算法失效
 * 3. 难以追踪的 bug
 * 4. SSR 兼容性问题
 *
 * 注意：此规则为警告级别，因为某些场景（如第三方库集成、焦点管理）确实需要直接操作 DOM
 */

/**
 * 直接 DOM 操作方法
 */
const DOM_METHODS = new Set([
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'getElementsByName',
  'querySelector',
  'querySelectorAll',
  'createElement',
  'createTextNode',
  'createDocumentFragment',
]);

/**
 * DOM 属性修改
 */
const DOM_PROPERTIES = new Set([
  'innerHTML',
  'outerHTML',
  'textContent',
  'innerText',
  'value',
  'style',
  'className',
  'classList',
]);

/**
 * 检查是否是 document.xxx 调用
 */
function isDocumentCall(node: BaseASTNode): { isDirect: boolean; methodName?: string } {
  if (node.type !== 'CallExpression') return { isDirect: false };

  const call = node as CallExpression;
  const callee = call.callee;

  if (callee.type === 'MemberExpression') {
    const memberExpr = callee as MemberExpression;
    const object = memberExpr.object;
    const property = memberExpr.property;

    // document.getElementById(), document.querySelector() 等
    if (object.type === 'Identifier' && object.name === 'document') {
      if (property.type === 'Identifier' && DOM_METHODS.has(property.name)) {
        return { isDirect: true, methodName: property.name };
      }
    }
  }

  return { isDirect: false };
}

/**
 * 检查是否是 this.$el 或 this.$refs.xxx 的 DOM 操作
 */
function isVueDomAccess(node: BaseASTNode): { isDirect: boolean; accessType?: string } {
  if (node.type !== 'MemberExpression') return { isDirect: false };

  const memberExpr = node as MemberExpression;
  const property = memberExpr.property;

  // this.$el
  if (property.type === 'Identifier' && property.name === '$el') {
    return { isDirect: true, accessType: '$el' };
  }

  // this.$refs.xxx (可能是 DOM 元素)
  if (property.type === 'Identifier' && property.name === '$refs') {
    return { isDirect: true, accessType: '$refs' };
  }

  return { isDirect: false };
}

/**
 * 检查是否是对 DOM 元素的属性赋值
 */
function isDomPropertyAssignment(node: BaseASTNode): { isDirect: boolean; property?: string } {
  if (node.type !== 'AssignmentExpression') return { isDirect: false };

  const assignment = node as BaseASTNode & {
    left: BaseASTNode;
    operator: string;
  };

  const left = assignment.left;
  if (left.type !== 'MemberExpression') return { isDirect: false };

  const memberExpr = left as MemberExpression;
  const property = memberExpr.property;

  // obj.innerHTML = xxx, obj.style = xxx 等
  if (property.type === 'Identifier' && DOM_PROPERTIES.has(property.name)) {
    // 检查是否是 this.$el.xxx 或 document.xxx 返回值
    const object = memberExpr.object;
    if (object.type === 'MemberExpression') {
      const objMember = object as MemberExpression;
      if (objMember.property?.type === 'Identifier') {
        const propName = (objMember.property as Identifier).name;
        if (propName === '$el' || propName === '$refs') {
          return { isDirect: true, property: property.name };
        }
      }
    }
  }

  return { isDirect: false };
}

/**
 * 检查是否在 Vue 组件上下文中
 */
function isInVueContext(node: BaseASTNode): boolean {
  let current: BaseASTNode | undefined = node;

  while (current) {
    // 检查是否在 export default { ... } 中 (Options API)
    if (current.type === 'ExportDefaultDeclaration') {
      return true;
    }

    // 检查是否在 defineComponent 或 Vue.extend 中
    if (current.type === 'CallExpression') {
      const call = current as CallExpression;
      if (call.callee.type === 'Identifier') {
        const name = (call.callee as Identifier).name;
        if (name === 'defineComponent' || name === 'extend') {
          return true;
        }
      }
    }

    // 检查是否在 setup 函数中 (Composition API)
    if (current.type === 'FunctionDeclaration' || current.type === 'ArrowFunctionExpression') {
      const func = current as BaseASTNode & { id?: Identifier };
      if (func.id?.name === 'setup') {
        return true;
      }
    }

    current = (current as BaseASTNode & { parent?: BaseASTNode }).parent;
  }

  return false;
}

/**
 * 允许的 DOM 方法
 */
const ALLOWED_DOM_METHODS = new Set([
  'focus',
  'blur',
  'scrollIntoView',
  'scrollTo',
  'scrollBy',
  'getBoundingClientRect',
  'getClientRects',
  'requestFullscreen',
  'exitFullscreen',
  'select', // input.select()
  'setSelectionRange',
  'click', // 程序化点击
]);

/**
 * 检查是否是允许的 DOM 操作（如 focus、scroll 等）
 */
function isAllowedOperation(node: BaseASTNode): boolean {
  if (node.type !== 'CallExpression') return false;

  const call = node as CallExpression;
  if (call.callee.type !== 'MemberExpression') return false;

  const memberExpr = call.callee as MemberExpression;
  const property = memberExpr.property;

  if (property.type === 'Identifier') {
    return ALLOWED_DOM_METHODS.has(property.name);
  }

  return false;
}

/**
 * 向上查找，检查节点是否在允许的 DOM 操作调用链中
 * 例如: this.$refs.input.focus() 中，this.$refs 应该被允许
 */
function isInAllowedCallChain(node: BaseASTNode): boolean {
  let current: BaseASTNode | undefined = node;

  while (current) {
    // 如果到达一个 CallExpression，检查是否是允许的操作
    if (current.type === 'CallExpression') {
      if (isAllowedOperation(current)) {
        return true;
      }
      // 如果是其他 CallExpression，停止查找
      return false;
    }

    // 如果不是 MemberExpression，停止查找
    if (current.type !== 'MemberExpression') {
      return false;
    }

    current = (current as BaseASTNode & { parent?: BaseASTNode }).parent;
  }

  return false;
}

export const vueNoDirectDomAccessRule: RuleDefinition<AstRuleContext> = {
  id: 'framework/vue-no-direct-dom-access',
  create(context: AstRuleContext) {
    return {
      CallExpression(node: BaseASTNode) {
        // 跳过允许的操作
        if (isAllowedOperation(node)) {
          return;
        }

        // 检查 document.xxx 调用
        const docResult = isDocumentCall(node);
        if (docResult.isDirect && docResult.methodName) {
          context.report({
            line: node.loc?.start?.line ?? 1,
            category: 'vue',
            ruleId: 'framework/vue-no-direct-dom-access',
            severity: 'warning' as IssueSeverity,
            message: `检测到直接 DOM 操作: document.${docResult.methodName}()，这违反 Vue 响应式原则。`,
            suggestion:
              '建议使用 ref/template ref 或 Vue 的响应式 API。如果确实需要直接操作 DOM，请确保在 onMounted/onUpdated 生命周期中进行，并添加注释说明原因。',
            fixSuggestion: {
              title: '使用 ref 代替直接 DOM 操作',
              description: '使用 Vue 的 template ref 来访问 DOM 元素，而不是使用 document 方法',
              fixType: 'guided' as const,
              steps: [
                { step: 1, action: '创建 ref 变量', detail: '在 script 中使用 ref() 创建引用变量' },
                { step: 2, action: '绑定到模板', detail: '在模板元素上添加 ref 属性' },
                { step: 3, action: '访问元素', detail: '通过 ref.value 访问 DOM 元素' },
              ],
              codeExample: {
                before: `const element = document.querySelector('.my-element');
element.focus();`,
                after: `<template>
  <div ref="myElement" class="my-element"></div>
</template>

<script setup>
const myElement = ref(null);

onMounted(() => {
  myElement.value?.focus();
});
</script>`,
              },
              references: [
                { title: 'Vue.js Template Refs', url: 'https://vuejs.org/guide/essentials/template-refs.html' },
              ],
            },
          });
          return;
        }
      },

      MemberExpression(node: BaseASTNode) {
        // 检查 this.$el 或 this.$refs 访问
        const vueResult = isVueDomAccess(node);
        if (vueResult.isDirect && vueResult.accessType) {
          // 检查是否在允许的调用链中（如 focus/scroll 等操作）
          if (isInAllowedCallChain(node)) {
            return;
          }

          context.report({
            line: node.loc?.start?.line ?? 1,
            category: 'vue',
            ruleId: 'framework/vue-no-direct-dom-access',
            severity: 'warning' as IssueSeverity,
            message: `检测到直接 DOM 访问: this.${vueResult.accessType}，可能导致状态与视图不一致。`,
            suggestion:
              vueResult.accessType === '$refs'
                ? '优先使用模板 ref 进行声明式操作。如果必须使用 $refs，请确保只读取状态而不直接修改 DOM。'
                : '避免直接操作 this.$el，建议使用 Vue 的响应式数据绑定或 template ref。',
          });
        }
      },

      AssignmentExpression(node: BaseASTNode) {
        // 检查 DOM 属性赋值
        const assignResult = isDomPropertyAssignment(node);
        if (assignResult.isDirect && assignResult.property) {
          context.report({
            line: node.loc?.start?.line ?? 1,
            category: 'vue',
            ruleId: 'framework/vue-no-direct-dom-access',
            severity: 'warning' as IssueSeverity,
            message: `检测到直接修改 DOM 属性: ${assignResult.property}，这会绕过 Vue 的响应式系统。`,
            suggestion:
              '建议通过 Vue 的响应式数据绑定来更新视图。例如使用 v-bind 绑定 style/class，使用 v-model 绑定 value，使用 {{ }} 插值绑定文本内容。',
          });
        }
      },
    };
  },
};
