import type { AstLintConfig } from '../config/types.js';
import type { RuleDefinition, AstRuleContextBase } from './types.js';
import { noHardcodedSecretsRule } from './rules/security/no-hardcoded-secrets.js';
import { unsafeEvalRule } from './rules/security/unsafe-eval.js';
import { noDomXssRule } from './rules/security/no-dom-xss.js';
import { noUnsafeRegexRule } from './rules/security/no-unsafe-regex.js';
import { noInnerHtmlRule } from './rules/security/no-inner-html.js';
import { noImplicitGlobalRule } from './rules/security/no-implicit-global.js';
import { altTextRequiredRule } from './rules/accessibility/alt-text-required.js';
import { noEmptyHeadingRule } from './rules/accessibility/no-empty-heading.js';
import { buttonHasTypeRule } from './rules/accessibility/button-has-type.js';
import { longFunctionRule } from './rules/maintainability/long-function.js';
import { complexFunctionRule } from './rules/maintainability/complex-function.js';
import { manyParametersRule } from './rules/maintainability/many-parameters.js';
import { deepNestingRule } from './rules/maintainability/deep-nesting.js';
import { magicNumberRule } from './rules/maintainability/magic-number.js';
import { eventHandlerNamingRule } from './rules/maintainability/event-handler-naming.js';
import { noFunctionInLoopRule } from './rules/maintainability/no-function-in-loop.js';
import { pxIntegerUnitsRule } from './rules/maintainability/integer-pixel-units.js';
import { noDeprecatedApisRule } from './rules/maintainability/no-deprecated-apis.js';
import { preferEarlyReturnRule } from './rules/maintainability/prefer-early-return.js';
import { namingConventionRule } from './rules/maintainability/naming-convention.js';
import { i18nSpecialCharsRule } from './rules/maintainability/i18n-special-chars.js';
import { noLargeZIndexRule } from './rules/maintainability/no-large-z-index.js';
import { vueInputMaxLengthTooLargeRule } from './rules/vue/input-max-length-too-large.js';
import { dialogButtonOrderRule } from './rules/vue/dialog-button-order.js';
import { vueNoVForIndexAsKeyRule } from './rules/vue/no-v-for-index-as-key.js';
import { vueNoTemplateKeyRule } from './rules/vue/no-template-key.js';
import { vueNoComplexExpressionsInTemplateRule } from './rules/vue/no-complex-expressions-in-template.js';
import { vueNoAsyncInComputedRule } from './rules/vue/no-async-in-computed.js';
import { vueNoDirectDomAccessRule } from './rules/vue/no-direct-dom-access.js';
import { vueNoTimerWithoutCleanupRule } from './rules/vue/no-timer-without-cleanup.js';
import { noVIfWithVForRule } from './rules/vue/no-v-if-with-v-for.js';
// Performance 规则
import { noLeakEventListenersRule } from './rules/performance/no-leak-event-listeners.js';
import { noLargeBundleImportRule } from './rules/performance/no-large-bundle-import.js';
import { noUnnecessaryReactiveRule } from './rules/performance/no-unnecessary-reactive.js';
import { preferVOnceRule } from './rules/performance/prefer-v-once.js';
import { noHeavyComputationsInRenderRule } from './rules/performance/no-heavy-computations-in-render.js';
import { missingLazyLoadRule } from './rules/performance/missing-lazy-load.js';
/**
 * 注意：以下规则已移除，因为与 ESLint/typescript-eslint/eslint-plugin-vue 完全重复，请使用对应规则：
 * - maintainability/no-console → ESLint: no-console
 * - maintainability/no-var → ESLint: no-var
 * - maintainability/no-loose-equals → ESLint: eqeqeq
 * - code-quality/no-unused-vars → ESLint: no-unused-vars
 * - code-quality/prefer-const → ESLint: prefer-const
 * - typescript/no-explicit-any → @typescript-eslint/no-explicit-any
 * - typescript/prefer-optional-chain → @typescript-eslint/prefer-optional-chain
 * - typescript/prefer-nullish-coalescing → @typescript-eslint/prefer-nullish-coalescing
 * - typescript/explicit-function-return-type → @typescript-eslint/explicit-function-return-type
 * - typescript/no-non-null-assertion → @typescript-eslint/no-non-null-assertion
 * - typescript/no-unused-expressions → @typescript-eslint/no-unused-expressions
 * - typescript/prefer-as-const → @typescript-eslint/prefer-as-const
 * - typescript/no-unnecessary-type-assertion → @typescript-eslint/no-unnecessary-type-assertion
 * - accessibility/button-has-type → eslint-plugin-vue: button-has-type
 * - framework/vue-vfor-key-required → eslint-plugin-vue: require-v-for-key
 * - framework/vue-no-v-if-v-for-together → eslint-plugin-vue: no-v-if-v-for
 * - framework/vue-no-v-html → eslint-plugin-vue: no-v-html
 * - framework/vue-component-name-pascal-case → eslint-plugin-vue: component-name-in-template-casing
 * - framework/vue-no-direct-prop-mutation → eslint-plugin-vue: no-mutating-props
 */

/**
 * AST 规则上下文
 */
export interface AstRuleContext extends AstRuleContextBase {
  config: AstLintConfig;
}

/**
 * 规则配置访问器定义
 */
export interface RuleConfigAccessor {
  /** 规则类别: concern 或 framework */
  category: 'concern' | 'framework';
  /** 规则组: security, maintainability, vue 等 */
  group: string;
  /** 规则键名（不带前缀） */
  key: string;
  /** 默认是否启用 */
  defaultEnabled: boolean;
}

/**
 * 内置规则注册表
 */
export const BUILTIN_RULES: Record<string, RuleDefinition<AstRuleContext>> = {
  'security/no-hardcoded-secrets': noHardcodedSecretsRule,
  'security/unsafe-eval': unsafeEvalRule,
  'security/no-dom-xss': noDomXssRule,
  'security/no-unsafe-regex': noUnsafeRegexRule,
  'security/no-inner-html': noInnerHtmlRule,
  'security/no-implicit-global': noImplicitGlobalRule,
  'accessibility/alt-text-required': altTextRequiredRule,
  'accessibility/no-empty-heading': noEmptyHeadingRule,
  'accessibility/button-has-type': buttonHasTypeRule,
  'maintainability/long-function': longFunctionRule,
  'maintainability/complex-function': complexFunctionRule,
  'maintainability/many-parameters': manyParametersRule,
  'maintainability/deep-nesting': deepNestingRule,
  'maintainability/magic-number': magicNumberRule,
  'maintainability/event-handler-naming': eventHandlerNamingRule,
  'maintainability/no-function-in-loop': noFunctionInLoopRule,
  'maintainability/integer-pixel-units': pxIntegerUnitsRule,
  'maintainability/no-deprecated-apis': noDeprecatedApisRule,
  'maintainability/prefer-early-return': preferEarlyReturnRule,
  'maintainability/naming-convention': namingConventionRule,
  'maintainability/i18n-special-chars': i18nSpecialCharsRule,
  'maintainability/no-large-z-index': noLargeZIndexRule,
  // Performance 规则
  'performance/no-leak-event-listeners': noLeakEventListenersRule,
  'performance/no-large-bundle-import': noLargeBundleImportRule,
  'performance/no-unnecessary-reactive': noUnnecessaryReactiveRule,
  'performance/prefer-v-once': preferVOnceRule,
  'performance/no-heavy-computations-in-render': noHeavyComputationsInRenderRule,
  'performance/missing-lazy-load': missingLazyLoadRule,
  // Vue 框架规则
  'framework/vue-input-max-length-too-large': vueInputMaxLengthTooLargeRule,
  'framework/vue-no-v-for-index-as-key': vueNoVForIndexAsKeyRule,
  'framework/vue-no-template-key': vueNoTemplateKeyRule,
  'framework/vue-no-complex-expressions-in-template': vueNoComplexExpressionsInTemplateRule,
  'framework/vue-dialog-button-order': dialogButtonOrderRule,
  'framework/vue-no-async-in-computed': vueNoAsyncInComputedRule,
  'framework/vue-no-direct-dom-access': vueNoDirectDomAccessRule,
  'framework/vue-no-timer-without-cleanup': vueNoTimerWithoutCleanupRule,
  'framework/vue-no-v-if-with-v-for': noVIfWithVForRule,
};

/**
 * 规则配置映射表
 * 定义每个规则在配置结构中的访问路径和默认值
 */
export const RULE_CONFIG_MAP: Record<string, RuleConfigAccessor> = {
  // Security 规则
  'security/no-hardcoded-secrets': {
    category: 'concern',
    group: 'security',
    key: 'no-hardcoded-secrets',
    defaultEnabled: true,
  },
  'security/unsafe-eval': {
    category: 'concern',
    group: 'security',
    key: 'unsafe-eval',
    defaultEnabled: true,
  },
  'accessibility/alt-text-required': {
    category: 'concern',
    group: 'accessibility',
    key: 'alt-text-required',
    defaultEnabled: true,
  },
  'accessibility/no-empty-heading': {
    category: 'concern',
    group: 'accessibility',
    key: 'no-empty-heading',
    defaultEnabled: true,
  },
  'accessibility/button-has-type': {
    category: 'concern',
    group: 'accessibility',
    key: 'button-has-type',
    defaultEnabled: true,
  },
  // Maintainability 规则
  'maintainability/long-function': {
    category: 'concern',
    group: 'maintainability',
    key: 'long-function',
    defaultEnabled: true,
  },
  'maintainability/complex-function': {
    category: 'concern',
    group: 'maintainability',
    key: 'complex-function',
    defaultEnabled: true,
  },
  'maintainability/many-parameters': {
    category: 'concern',
    group: 'maintainability',
    key: 'many-parameters',
    defaultEnabled: true,
  },
  'maintainability/deep-nesting': {
    category: 'concern',
    group: 'maintainability',
    key: 'deep-nesting',
    defaultEnabled: true,
  },
  'maintainability/magic-number': {
    category: 'concern',
    group: 'maintainability',
    key: 'magic-number',
    defaultEnabled: true,
  },
  'maintainability/event-handler-naming': {
    category: 'concern',
    group: 'maintainability',
    key: 'event-handler-naming',
    defaultEnabled: true,
  },
  'maintainability/no-function-in-loop': {
    category: 'concern',
    group: 'maintainability',
    key: 'no-function-in-loop',
    defaultEnabled: true,
  },
  'maintainability/integer-pixel-units': {
    category: 'concern',
    group: 'maintainability',
    key: 'integer-pixel-units',
    defaultEnabled: true, // 默认启用，检查 CSS 中的整数像素单位
  },
  'maintainability/no-deprecated-apis': {
    category: 'concern',
    group: 'maintainability',
    key: 'no-deprecated-apis',
    defaultEnabled: true,
  },
  'maintainability/prefer-early-return': {
    category: 'concern',
    group: 'maintainability',
    key: 'prefer-early-return',
    defaultEnabled: true,
  },
  'maintainability/naming-convention': {
    category: 'concern',
    group: 'maintainability',
    key: 'naming-convention',
    defaultEnabled: true,
  },
  'maintainability/i18n-special-chars': {
    category: 'concern',
    group: 'maintainability',
    key: 'i18n-special-chars',
    defaultEnabled: true,
  },
  'maintainability/no-large-z-index': {
    category: 'concern',
    group: 'maintainability',
    key: 'no-large-z-index',
    defaultEnabled: true,
  },
  'security/no-dom-xss': {
    category: 'concern',
    group: 'security',
    key: 'no-dom-xss',
    defaultEnabled: true,
  },
  'security/no-unsafe-regex': {
    category: 'concern',
    group: 'security',
    key: 'no-unsafe-regex',
    defaultEnabled: true,
  },
  'security/no-inner-html': {
    category: 'concern',
    group: 'security',
    key: 'no-inner-html',
    defaultEnabled: true,
  },
  'security/no-implicit-global': {
    category: 'concern',
    group: 'security',
    key: 'no-implicit-global',
    defaultEnabled: true,
  },
  // Performance 规则
  'performance/no-leak-event-listeners': {
    category: 'concern',
    group: 'performance',
    key: 'no-leak-event-listeners',
    defaultEnabled: true,
  },
  'performance/no-large-bundle-import': {
    category: 'concern',
    group: 'performance',
    key: 'no-large-bundle-import',
    defaultEnabled: true,
  },
  'performance/no-unnecessary-reactive': {
    category: 'concern',
    group: 'performance',
    key: 'no-unnecessary-reactive',
    defaultEnabled: true,
  },
  'performance/prefer-v-once': {
    category: 'framework',
    group: 'vue',
    key: 'vue-prefer-v-once',
    defaultEnabled: false, // 默认关闭，因为可能误报较多
  },
  'performance/no-heavy-computations-in-render': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-heavy-computations-in-render',
    defaultEnabled: true,
  },
  'performance/missing-lazy-load': {
    category: 'concern',
    group: 'performance',
    key: 'missing-lazy-load',
    defaultEnabled: true,
  },
  // Vue 框架规则
  'framework/vue-input-max-length-too-large': {
    category: 'framework',
    group: 'vue',
    key: 'vue-input-max-length-too-large',
    defaultEnabled: true,
  },
  'framework/vue-no-v-for-index-as-key': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-v-for-index-as-key',
    defaultEnabled: true,
  },
  'framework/vue-no-template-key': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-template-key',
    defaultEnabled: true,
  },
  'framework/vue-no-complex-expressions-in-template': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-complex-expressions-in-template',
    defaultEnabled: true,
  },
  'framework/vue-dialog-button-order': {
    category: 'framework',
    group: 'vue',
    key: 'vue-dialog-button-order',
    defaultEnabled: true,
  },
  'framework/vue-no-async-in-computed': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-async-in-computed',
    defaultEnabled: true,
  },
  'framework/vue-no-direct-dom-access': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-direct-dom-access',
    defaultEnabled: true,
  },
  'framework/vue-no-timer-without-cleanup': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-timer-without-cleanup',
    defaultEnabled: true,
  },
  'framework/vue-no-v-if-with-v-for': {
    category: 'framework',
    group: 'vue',
    key: 'vue-no-v-if-with-v-for',
    defaultEnabled: true,
  },
};

