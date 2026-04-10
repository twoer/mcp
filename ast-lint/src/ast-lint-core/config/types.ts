export type SeverityLevel = 'error' | 'warning' | 'info';

export interface AiModelConfig {
  name: string;
  apiUrl: string;
  apiKey: string; // 已解析环境变量占位符后的实际值
  headers?: Record<string, string>;
  /**
   * 适配器类型，如果不指定则根据 apiUrl 自动推断
   */
  adapter?: 'openai' | 'glm' | 'claude' | 'auto';
}

export interface AiConfig {
  enabled: boolean;
  activeModel: string;
  timeout: number;
  fallbackToAST: boolean;
  maxRetries: number;
  /** 输入 prompt 最大字符数（超出则截断 diff），默认不限制 */
  maxPromptChars?: number;
  /** 最大输出 token 数，传递给模型 API */
  maxOutputTokens?: number;
  /** 自定义 prompt 模板选项 */
  promptTemplate?: {
    systemRole?: string;
    reviewFocus?: string[];
    outputFormat?: string;
  };
}

export interface ReportingConfig {
  autoSave: boolean;
  saveDir: string;
  defaultFormat: 'text' | 'json' | 'markdown';
  verbose: boolean;
  showProgress: boolean;
  /** 自动清理：保留最近 N 个报告，0 表示不自动清理 */
  maxReports?: number;
}

export type CheckMode = 'diff' | 'staged' | 'all';

export interface DefaultsConfig {
  checkMode: CheckMode;
  failOnWarnings: boolean;
  ignorePatterns: string[];
  /** Git 过滤限制：最大文件数量 */
  maxFiles?: number;
  /** Git 过滤限制：单个文件最大字节数 */
  maxFileSize?: number;
  /** Git 过滤限制：总 diff 最大字节数 */
  maxDiffSize?: number;
  /** AST 分析并发数限制，默认 5 */
  concurrency?: number;
}

/** AST 缓存配置 */
export interface CacheConfig {
  /** 是否启用缓存，默认 true */
  enabled: boolean;
  /** 最大缓存时间（毫秒），默认 7 天 (604800000) */
  maxAge?: number;
  /** 缓存存储目录，默认 <project>/.ast-lint/cache */
  location?: string;
}

export interface RuleConfigBase {
  enabled: boolean;
  severity: SeverityLevel;
  description?: string;
  params?: Record<string, unknown>;
  autoFix?: boolean;
  fixCommand?: string;
}

export type RuleMap = Record<string, RuleConfigBase>;

export interface FrameworkRuleGroupConfig {
  enabled: boolean;
  rules: RuleMap;
}

export interface ConcernRuleGroupConfig {
  enabled: boolean;
  rules: RuleMap;
}

export interface RulesConfig {
  framework?: Record<string, FrameworkRuleGroupConfig>;
  concern?: Record<string, ConcernRuleGroupConfig>;
}

export interface AstLintConfig {
  version: string;
  ai: AiConfig;
  models: Record<string, AiModelConfig>;
  reporting: ReportingConfig;
  defaults: DefaultsConfig;
  rules: RulesConfig;
  /** AST 缓存配置 */
  cache?: CacheConfig;
}
