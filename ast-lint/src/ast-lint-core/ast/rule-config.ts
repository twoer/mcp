import type { AstLintConfig } from '../config/types.js';
import { RULE_CONFIG_MAP, type RuleConfigAccessor } from './rule-registry.js';

/**
 * 检查规则是否启用
 */
export function isRuleEnabled(ruleId: string, config: AstLintConfig): boolean {
  const accessor = RULE_CONFIG_MAP[ruleId];
  if (!accessor) {
    return false;
  }

  // 检查规则组是否启用
  if (accessor.category === 'framework') {
    const frameworkCfg = config.rules.framework?.[accessor.group];
    if (frameworkCfg && frameworkCfg.enabled === false) {
      return false;
    }
  } else if (accessor.category === 'concern') {
    const concernCfg = config.rules.concern?.[accessor.group];
    if (concernCfg && concernCfg.enabled === false) {
      return false;
    }
  }

  // 获取规则配置
  let ruleCfg;
  if (accessor.category === 'concern') {
    ruleCfg = config.rules.concern?.[accessor.group]?.rules?.[accessor.key];
  } else {
    ruleCfg = config.rules.framework?.[accessor.group]?.rules?.[accessor.key];
  }

  const result = Boolean(ruleCfg?.enabled ?? accessor.defaultEnabled);

  return result;
}

/**
 * 获取规则配置
 */
export function getRuleConfig(ruleId: string, config: AstLintConfig) {
  const accessor = RULE_CONFIG_MAP[ruleId];
  if (!accessor) {
    return undefined;
  }

  if (accessor.category === 'concern') {
    return config.rules.concern?.[accessor.group]?.rules?.[accessor.key];
  } else {
    return config.rules.framework?.[accessor.group]?.rules?.[accessor.key];
  }
}

/**
 * 获取所有启用的规则 ID
 */
export function getActiveRuleIds(config: AstLintConfig): string[] {
  const allRuleIds = Object.keys(RULE_CONFIG_MAP);
  const activeIds = allRuleIds.filter(ruleId => isRuleEnabled(ruleId, config));

  return activeIds;
}

