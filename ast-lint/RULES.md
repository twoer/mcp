# AST Lint 规则文档

本文档包含 AST Lint 的所有代码质量规则说明。

## 目录

- [安全性 (Security)](#安全性-security) - 6 条规则
- [可维护性 (Maintainability)](#可维护性-maintainability) - 13 条规则
- [性能 (Performance)](#性能-performance) - 6 条规则
- [可访问性 (Accessibility)](#可访问性-accessibility) - 3 条规则
- [Vue 框架 (Vue)](#vue-框架-vue) - 9 条规则

---

## 安全性 (Security)

### security/no-hardcoded-secrets

**严重度**: 🔴 Error  
**修复类型**: Manual Fix

**描述**: 检测硬编码的密钥、密码等敏感信息。硬编码的密钥、令牌等敏感信息会被提交到代码仓库，存在泄露风险。

**代码示例**:

\`\`\`typescript
// ❌ 错误
const apiKey = 'sk_live_abcd1234efgh5678';
const config = {
  secret: 'my-secret-token-12345'
};

// ✅ 正确
const apiKey = process.env.API_KEY;
const config = {
  secret: process.env.SECRET_TOKEN
};
\`\`\`

**参考资源**:
- [MDN - process.env](https://nodejs.org/api/process.html#process_process_env)
- [OWASP - Sensitive Data Exposure](https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure)

---

### security/no-implicit-global

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测隐式全局变量。在非严格模式下，对未声明的变量赋值会创建全局变量，可能导致全局命名空间污染、变量冲突和难以调试的问题。

**代码示例**:

\`\`\`javascript
// ❌ 错误
varName = 123;

// ✅ 正确
const varName = 123;
// 或在文件顶部添加
"use strict";
\`\`\`

**参考资源**:
- [MDN - 严格模式](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Strict_mode)
- [MDN - var/let/const](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/const)

---

### security/no-inner-html

**严重度**: 🔴 Error (赋值) / ⚠️ Warning (访问)  
**修复类型**: Manual Fix

**描述**: 检测 innerHTML 的使用。直接使用 innerHTML 可能导致 XSS 攻击，即使不是赋值操作也存在风险。

**代码示例**:

\`\`\`javascript
// ❌ 错误
element.innerHTML = userInput;
const html = element.innerHTML;

// ✅ 正确
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);
\`\`\`

**参考资源**:
- [MDN - innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML)
- [OWASP - XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

### security/no-dom-xss

**严重度**: 🔴 Error  
**修复类型**: Manual Fix

**描述**: 检测可能导致 DOM XSS 的危险操作。直接将用户输入插入到 DOM 中可能导致 XSS 攻击。

**代码示例**:

\`\`\`javascript
// ❌ 错误
element.insertAdjacentHTML('beforeend', userInput);
document.write(userInput);

// ✅ 正确
element.textContent = userInput;
// 或使用 DOMPurify 库
element.innerHTML = DOMPurify.sanitize(userInput);
\`\`\`

**参考资源**:
- [OWASP - XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [MDN - textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)

---

### security/no-unsafe-regex

**严重度**: 🔴 Error (嵌套量词) / ⚠️ Warning (其他)  
**修复类型**: Guided Fix

**描述**: 检测可能导致 ReDoS 攻击的不安全正则表达式。复杂的正则表达式可能导致拒绝服务攻击。

**代码示例**:

\`\`\`javascript
// ❌ 错误
const regex = /(a+)+b/;
const regex2 = /.*.*.*@.*/;

// ✅ 正确
const regex = /a+b/;
const regex2 = /[^@]+@[^@]+/;
\`\`\`

**参考资源**:
- [OWASP - ReDoS](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
- [MDN - RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)

---

### security/unsafe-eval

**严重度**: 🔴 Error  
**修复类型**: Manual Fix

**描述**: 检测 eval() 和 Function 构造器的使用。这些方法会执行动态字符串代码，存在严重的安全风险。

**代码示例**:

\`\`\`javascript
// ❌ 错误
const result = eval(userInput);
setTimeout("alert('hello')", 1000);

// ✅ 正确
const result = JSON.parse(userInput);
setTimeout(() => alert('hello'), 1000);
\`\`\`

**参考资源**:
- [MDN - eval()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval)
- [OWASP - Code Injection](https://owasp.org/www-community/attacks/Code_Injection)

---

## 可维护性 (Maintainability)

### maintainability/integer-pixel-units

**严重度**: ⚠️ Warning  
**修复类型**: Safe Fix

**描述**: 检查 CSS px 单位必须为整数。确保设计系统一致性，避免 20.5px, 12.22px 等不规范值。支持 Tailwind 任意值语法检测。

**代码示例**:

\`\`\`css
/* ❌ 错误 */
.element {
  width: 20.5px;
  height: 12.22px;
}

/* ✅ 正确 */
.element {
  width: 20px;
  height: 12px;
}
\`\`\`

---

### maintainability/prefer-early-return

**严重度**: ℹ️ Info / 🔴 Error (死代码)  
**修复类型**: Guided Fix

**描述**: 检测可以使用提前返回模式的场景。提前返回可以减少嵌套，提高代码可读性。

**代码示例**:

\`\`\`javascript
// ❌ 错误
function process(data) {
  if (data.valid) {
    // 主逻辑
  } else {
    return;
  }
}

// ✅ 正确
function process(data) {
  if (!data.valid) return;
  // 主逻辑
}
\`\`\`

**参考资源**:
- [Guard Clause Pattern](https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html)
- [Clean Code - Early Return](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)

---

### maintainability/deep-nesting

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测代码嵌套层级过深的情况。嵌套过深会导致代码难以理解和维护。默认限制为 4 层。

**代码示例**:

\`\`\`javascript
// ❌ 错误
function process(data) {
  if (data) {
    if (data.valid) {
      if (data.items) {
        // 深层嵌套...
      }
    }
  }
}

// ✅ 正确
function process(data) {
  if (!data || !data.valid || !data.items) return;
  // 扁平化的逻辑
  processItems(data.items);
}
\`\`\`

**参考资源**:
- [Clean Code - Avoid Deep Nesting](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
- [Refactoring - Replace Nested Conditional](https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html)

---

### maintainability/no-large-z-index

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 禁止使用过大的 z-index 值。过大的 z-index（如 9999, 999999）难以维护，容易导致 z-index 竞赛。默认限制为 1000。

**代码示例**:

\`\`\`css
/* ❌ 错误 */
.modal { z-index: 9999; }
.tooltip { z-index: 999999; }

/* ✅ 正确 */
.modal { z-index: 100; }
.tooltip { z-index: 200; }
\`\`\`

**参考资源**:
- [MDN - z-index](https://developer.mozilla.org/en-US/docs/Web/CSS/z-index)
- [CSS Guidelines - z-index](https://cssguidelin.es/#z-index)

---

### maintainability/complex-function

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测函数圈复杂度过高的情况。圈复杂度过高意味着函数有太多的控制流分支，难以测试和维护。默认限制为 10。

**代码示例**:

\`\`\`javascript
// ❌ 错误
function calculate(type, value) {
  if (type === 'A') {
    if (value > 100) return value * 0.9;
    else return value * 0.95;
  } else if (type === 'B') {
    // 更多分支...
  }
}

// ✅ 正确
function calculate(type, value) {
  const strategies = {
    A: calculateTypeA,
    B: calculateTypeB
  };
  return strategies[type](value);
}
\`\`\`

**参考资源**:
- [Cyclomatic Complexity](https://en.wikipedia.org/wiki/Cyclomatic_complexity)
- [Refactoring - Simplifying Conditional Logic](https://refactoring.com/catalog/)

---

### maintainability/long-function

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测函数过长的情况。函数过长通常意味着职责过多，应该拆分。默认限制为 50 行。

**代码示例**:

\`\`\`javascript
// ❌ 错误
function processUser(user) {
  // 50+ 行代码
  // 验证、转换、保存、通知...
}

// ✅ 正确
function processUser(user) {
  validateUser(user);
  const transformed = transformUserData(user);
  saveUser(transformed);
  notifyUser(user);
}
\`\`\`

**参考资源**:
- [Clean Code - Functions](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
- [Refactoring - Extract Method](https://refactoring.com/catalog/extractFunction.html)

---

### maintainability/magic-number

**严重度**: ℹ️ Info  
**修复类型**: Guided Fix

**描述**: 检测魔法数字（未命名的数字字面量）。魔法数字应该提取为常量，提高代码可读性。

**代码示例**:

\`\`\`javascript
// ❌ 错误
setTimeout(() => { ... }, 3000);

// ✅ 正确
const DELAY_MS = 3000;
setTimeout(() => { ... }, DELAY_MS);
\`\`\`

**参考资源**:
- [Clean Code - 避免魔法数字](https://refactoring.guru/smells/magic-numbers)
- [ESLint - no-magic-numbers](https://eslint.org/docs/latest/rules/no-magic-numbers)

---

### maintainability/event-handler-naming

**严重度**: ⚠️ Warning  
**修复类型**: Safe Fix

**描述**: 检测事件处理函数的命名规范。所有事件处理方法都应该以 handle 开头命名。

**代码示例**:

\`\`\`vue
<!-- ❌ 错误 -->
<button @click="onClick">点击</button>

<script setup>
const onClick = () => {
  console.log('clicked');
};
</script>

<!-- ✅ 正确 -->
<button @click="handleClick">点击</button>

<script setup>
const handleClick = () => {
  console.log('clicked');
};
</script>
\`\`\`

**参考资源**:
- [Vue.js Style Guide](https://vuejs.org/style-guide/)

---

### maintainability/i18n-special-chars

**严重度**: ⚠️ Warning  
**修复类型**: Safe Fix

**描述**: 检测 vue-i18n v9+ 特殊字符。这些字符在 vue-i18n 中有特殊含义，直接使用会导致编译错误。特殊字符包括：@ { } |

**代码示例**:

\`\`\`json
// ❌ 错误
{
  "message": "邮箱格式：user@example.com"
}

// ✅ 正确
{
  "message": "邮箱格式：user{'@'}example.com"
}
\`\`\`

**参考资源**:
- [vue-i18n v9 Migration](https://vue-i18n.intlify.dev/guide/migration/vue3.html)

---

### maintainability/no-deprecated-apis

**严重度**: 🔴 Error  
**修复类型**: Guided Fix

**描述**: 检测废弃 API 的使用。包括 JavaScript、Node.js、浏览器和 Vue 的废弃 API。

**代码示例**:

\`\`\`javascript
// ❌ 错误
escape(str);
new Buffer(size);
new Vue({ ... });

// ✅ 正确
encodeURI(str);
Buffer.alloc(size);
createApp({ ... });
\`\`\`

**参考资源**:
- [Vue.js Migration Guide](https://v3-migration.vuejs.org/)

---

### maintainability/naming-convention

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测命名一致性规范。变量/参数应使用 camelCase，常量使用 UPPER_SNAKE_CASE。

**代码示例**:

\`\`\`javascript
// ❌ 错误
const user_name = 'John';
const user_age = 25;

// ✅ 正确
const userName = 'John';
const userAge = 25;
\`\`\`

**参考资源**:
- [JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html#naming)

---

### maintainability/many-parameters

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测函数参数过多的情况。参数过多通常意味着函数职责不清晰。默认限制为 4 个参数。

**代码示例**:

\`\`\`javascript
// ❌ 错误
function createUser(name, age, email, phone, address) {
  // ...
}

createUser('John', 25, 'john@example.com', '123456', 'Street 1');

// ✅ 正确
function createUser({ name, age, email, phone, address }) {
  // ...
}

createUser({
  name: 'John',
  age: 25,
  email: 'john@example.com',
  phone: '123456',
  address: 'Street 1'
});
\`\`\`

**参考资源**:
- [Clean Code](https://github.com/ryanmcdermott/clean-code-javascript#functions)

---

### maintainability/no-function-in-loop

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测在循环中创建函数。在循环中创建函数可能导致闭包问题和性能问题。

**代码示例**:

\`\`\`javascript
// ❌ 错误
for (let i = 0; i < items.length; i++) {
  const handler = () => console.log(items[i]);
  element.addEventListener('click', handler);
}

// ✅ 正确
const createHandler = (item) => () => console.log(item);

for (let i = 0; i < items.length; i++) {
  const handler = createHandler(items[i]);
  element.addEventListener('click', handler);
}
\`\`\`

**参考资源**:
- [JavaScript Performance](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures)

---

## 性能 (Performance)

### performance/missing-lazy-load

**严重度**: ⚠️ Warning  
**修复类型**: Suggested Fix

**描述**: 检测缺少懒加载的大型资源。图片、视频等大型资源应该使用懒加载以提高页面性能。

---

### performance/no-unnecessary-reactive

**严重度**: ⚠️ Warning  
**修复类型**: Suggested Fix

**描述**: 检测不必要的响应式数据。过多的响应式数据会影响性能，应该只对需要响应的数据使用响应式。

---

### performance/no-heavy-computations-in-render

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测在渲染函数中进行重计算。重计算应该使用 computed 或 memo 缓存。

---

### performance/no-large-bundle-import

**严重度**: ⚠️ Warning  
**修复类型**: Suggested Fix

**描述**: 检测大型库的完整导入。应该使用按需导入以减小打包体积。

---

### performance/no-leak-event-listeners

**严重度**: 🔴 Error  
**修复类型**: Guided Fix

**描述**: 检测可能泄漏的事件监听器。事件监听器应该在组件卸载时移除。

---

### performance/prefer-v-once

**严重度**: ℹ️ Info  
**修复类型**: Safe Fix

**描述**: 检测可以使用 v-once 优化的静态内容。静态内容使用 v-once 可以避免不必要的重新渲染。

---

## 可访问性 (Accessibility)

### accessibility/no-empty-heading

**严重度**: 🔴 Error  
**修复类型**: Manual Fix

**描述**: 检测空的标题元素。标题元素应该包含有意义的文本内容。

---

### accessibility/button-has-type

**严重度**: ⚠️ Warning  
**修复类型**: Safe Fix

**描述**: 检测 button 元素缺少 type 属性。button 元素应该明确指定 type 属性（button/submit/reset）。

---

### accessibility/alt-text-required

**严重度**: 🔴 Error  
**修复类型**: Manual Fix

**描述**: 检测 img 元素缺少 alt 属性。所有图片都应该提供替代文本以提高可访问性。

---

## Vue 框架 (Vue)

### vue/no-async-in-computed

**严重度**: 🔴 Error  
**修复类型**: Guided Fix

**描述**: 检测在 computed 中使用异步操作。computed 应该是同步的纯函数。

---

### vue/no-complex-expressions-in-template

**严重度**: ⚠️ Warning  
**修复类型**: Suggested Fix

**描述**: 检测模板中的复杂表达式。复杂逻辑应该提取到 computed 或 methods 中。

---

### vue/no-direct-dom-access

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测直接操作 DOM。应该使用 Vue 的响应式系统和 ref 来操作 DOM。

---

### vue/no-timer-without-cleanup

**严重度**: 🔴 Error  
**修复类型**: Guided Fix

**描述**: 检测没有清理的定时器。定时器应该在组件卸载时清理。

---

### vue/no-v-if-with-v-for

**严重度**: 🔴 Error  
**修复类型**: Guided Fix

**描述**: 检测 v-if 和 v-for 同时使用。这会导致性能问题，应该使用 computed 过滤数据。

---

### vue/no-v-for-index-as-key

**严重度**: ⚠️ Warning  
**修复类型**: Manual Fix

**描述**: 检测使用索引作为 v-for 的 key。应该使用唯一标识符作为 key。

---

### vue/no-template-key

**严重度**: 🔴 Error  
**修复类型**: Safe Fix

**描述**: 检测在 template 标签上使用 key。key 应该放在实际的元素上。

---

### vue/dialog-button-order

**严重度**: ⚠️ Warning  
**修复类型**: Safe Fix

**描述**: 检测对话框按钮顺序。确认按钮应该在取消按钮之后（符合用户习惯）。

---

### vue/input-max-length-too-large

**严重度**: ⚠️ Warning  
**修复类型**: Guided Fix

**描述**: 检测 input 的 maxlength 过大。过大的 maxlength 可能不符合实际需求。

---

## 规则统计

- **总计**: 37 条规则
- **安全性**: 6 条
- **可维护性**: 13 条
- **性能**: 6 条
- **可访问性**: 3 条
- **Vue 框架**: 9 条

## 严重度分布

- 🔴 **Error**: 高优先级问题，必须修复
- ⚠️ **Warning**: 中优先级问题，建议修复
- ℹ️ **Info**: 低优先级问题，可选修复

## 修复类型说明

- **Safe Fix**: 可以自动修复，不会改变代码行为
- **Suggested Fix**: 提供修复代码，需要人工确认
- **Guided Fix**: 提供修复步骤指导
- **Manual Fix**: 需要手动重构

---

*本文档由 AST Lint 自动生成，最后更新时间：2026-03-13*
