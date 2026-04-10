import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AstLintConfig } from './types.js';

/**
 * 配置文件名列表（按优先级排序）
 */
const CONFIG_FILE_NAMES = [
  '.astlintrc.json',
  '.astlintrc',
  'astlint.config.json',
];

/**
 * 从指定目录向上查找配置文件
 */
function findConfigFile(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = path.join(currentDir, fileName);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // 已到达根目录
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * 加载并解析配置文件
 */
export function loadConfigFile(projectRoot?: string): Partial<AstLintConfig> | null {
  const startDir = projectRoot || process.cwd();
  const configPath = findConfigFile(startDir);

  if (!configPath) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content) as Partial<AstLintConfig>;
    return config;
  } catch (error) {
    console.error(`[AST Lint] 配置文件解析失败: ${configPath}`, error);
    return null;
  }
}

/**
 * 合并配置（用户配置覆盖默认配置）
 */
export function mergeConfig(
  defaultConfig: AstLintConfig,
  userConfig: Partial<AstLintConfig> | null
): AstLintConfig {
  if (!userConfig) {
    return defaultConfig;
  }

  // 深度合并配置
  const merged: AstLintConfig = {
    ...defaultConfig,
    ...userConfig,
    ai: {
      ...defaultConfig.ai,
      ...userConfig.ai,
    },
    models: {
      ...defaultConfig.models,
      ...userConfig.models,
    },
    reporting: {
      ...defaultConfig.reporting,
      ...userConfig.reporting,
    },
    defaults: {
      ...defaultConfig.defaults,
      ...userConfig.defaults,
    },
    cache: userConfig.cache ? {
      enabled: userConfig.cache.enabled ?? defaultConfig.cache?.enabled ?? true,
      maxAge: userConfig.cache.maxAge ?? defaultConfig.cache?.maxAge,
      location: userConfig.cache.location ?? defaultConfig.cache?.location,
    } : defaultConfig.cache,
    rules: mergeRulesConfig(defaultConfig.rules, userConfig.rules),
  };

  return merged;
}

/**
 * 合并规则配置
 */
function mergeRulesConfig(
  defaultRules: AstLintConfig['rules'],
  userRules?: Partial<AstLintConfig['rules']>
): AstLintConfig['rules'] {
  if (!userRules) {
    return defaultRules;
  }

  const merged: AstLintConfig['rules'] = {
    framework: { ...defaultRules.framework },
    concern: { ...defaultRules.concern },
  };

  // 合并 framework 规则
  if (userRules.framework) {
    for (const [group, groupConfig] of Object.entries(userRules.framework)) {
      if (merged.framework && merged.framework[group]) {
        merged.framework[group] = {
          ...merged.framework[group],
          ...groupConfig,
          rules: {
            ...merged.framework[group].rules,
            ...groupConfig.rules,
          },
        };
      } else if (merged.framework) {
        merged.framework[group] = groupConfig;
      }
    }
  }

  // 合并 concern 规则
  if (userRules.concern) {
    for (const [group, groupConfig] of Object.entries(userRules.concern)) {
      if (merged.concern && merged.concern[group]) {
        merged.concern[group] = {
          ...merged.concern[group],
          ...groupConfig,
          rules: {
            ...merged.concern[group].rules,
            ...groupConfig.rules,
          },
        };
      } else if (merged.concern) {
        merged.concern[group] = groupConfig;
      }
    }
  }

  return merged;
}

/**
 * 验证配置文件格式
 */
export function validateConfig(config: Partial<AstLintConfig>): string[] {
  const errors: string[] = [];

  // 验证版本
  if (config.version && typeof config.version !== 'string') {
    errors.push('version 必须是字符串');
  }

  // 验证 AI 配置
  if (config.ai) {
    if (typeof config.ai.enabled !== 'boolean') {
      errors.push('ai.enabled 必须是布尔值');
    }
    if (config.ai.timeout && typeof config.ai.timeout !== 'number') {
      errors.push('ai.timeout 必须是数字');
    }
  }

  // 验证规则配置
  if (config.rules) {
    if (config.rules.framework && typeof config.rules.framework !== 'object') {
      errors.push('rules.framework 必须是对象');
    }
    if (config.rules.concern && typeof config.rules.concern !== 'object') {
      errors.push('rules.concern 必须是对象');
    }
  }

  return errors;
}
