import type { AstRuleContext } from '../../rule-registry.js';
import type { IssueSeverity, RuleDefinition } from '../../types.js';
import type {
  BaseASTNode,
  Literal,
  TemplateLiteral,
  Property,
  VariableDeclarator,
  Identifier,
} from '../../ast-types.js';

/**
 * 敏感变量名模式
 */
const SENSITIVE_KEYS = ['apiKey', 'apikey', 'secret', 'token', 'password', 'pwd', 'passphrase', 'privateKey', 'privatekey'];

/**
 * 常见密钥格式的正则表达式模式
 * 这些模式用于检测可能的硬编码密钥值
 */
const SECRET_PATTERNS = [
  // Stripe API keys: sk_live_xxx, sk_test_xxx, pk_live_xxx, pk_test_xxx
  /\b(sk_live_|sk_test_|pk_live_|pk_test_)[a-zA-Z0-9]{32,}\b/,
  // Google API keys: AIzaSy_xxx, GOOG1_xxx
  /\b(AIza[A-Za-z0-9_-]{35}|GOOG1[A-Za-z0-9_-]{30,})\b/,
  // AWS Access Key IDs: AKIAxxxxxxxx
  /\b(AKIA[0-9A-Z]{16})\b/,
  // GitHub tokens: ghp_xxx, gho_xxx, ghu_xxx, ghs_xxx, ghr_xxx
  /\b(ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}\b/,
  // GitHub legacy tokens: 0123456789abcdef0123456789abcdef01234567
  /\b[0-9a-f]{40}\b/,
  // Slack tokens: xoxb-xxx, xoxp-xxx
  /\b(xox[bap]-[0-9]{10,}-[0-9]{10,}-[0-9a-zA-Z]{24})\b/,
  // JWT tokens: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  /\b(eyJ[A-Za-z0-9_-]+\.(?:eyJ[A-Za-z0-9_-]+\.)?[A-Za-z0-9_-]+)\b/,
  // Generic base64 encoded secrets (20+ chars, looks like base64)
  /\b[A-Za-z0-9+/]{20,}={0,2}\b/,
];

/**
 * 安全的值（不会误报的常见值）
 */
const SAFE_VALUES = new Set([
  'public_key', 'publickey', 'public', 'demo', 'test', 'example', 'sample',
  'localhost', '127.0.0.1', '0.0.0.0', 'development', 'staging',
  '', ' ', 'null', 'undefined', 'none', 'mock', 'fake',
]);

/**
 * UI 相关的属性名（通常包含文案，不是密钥）
 */
const UI_PROPERTY_NAMES = new Set([
  'message', 'title', 'description', 'label', 'placeholder',
  'text', 'content', 'tooltip', 'hint', 'caption', 'name',
  'displayName', 'display_name', 'display', 'value', 'defaultValue',
  'default_value', 'default', 'type', 'status', 'state', 'mode',
  'theme', 'variant', 'size', 'color', 'icon', 'image', 'src',
  'href', 'url', 'link', 'path', 'route', 'to', 'from',
]);

/**
 * 检查文件路径是否为 i18n 相关文件
 */
function isI18nFile(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return (
    lowerPath.includes('/i18n/') ||
    lowerPath.includes('/locales/') ||
    lowerPath.includes('/lang/') ||
    lowerPath.includes('/languages/') ||
    lowerPath.includes('/translations/') ||
    lowerPath.endsWith('.i18n.ts') ||
    lowerPath.endsWith('.i18n.js') ||
    lowerPath.endsWith('.locale.ts') ||
    lowerPath.endsWith('.locale.js')
  );
}

/**
 * 检查字符串是否为完整句子（包含空格和标点）
 */
function isCompleteSentence(value: string): boolean {
  // 如果包含空格或常见标点，且长度超过 10，很可能是文案
  return /[\s,.!?;:，。！？；：]/.test(value) && value.length > 10;
}

/**
 * 计算字符串的熵值（用于检测随机性）
 */
function calculateEntropy(str: string): number {
  const len = str.length;
  const frequencies: Record<string, number> = {};

  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  for (const freq of Object.values(frequencies)) {
    const p = freq / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * 检查字符串值是否可能是密钥（增强版）
 */
function looksLikeSecret(value: string, propertyName?: string, filePath?: string): boolean {
  // 转小写检查安全值
  const lowerValue = value.toLowerCase().trim();

  // 跳过明显的安全值
  if (SAFE_VALUES.has(lowerValue)) {
    return false;
  }

  // 如果是 i18n 文件，降低检测强度
  if (filePath && isI18nFile(filePath)) {
    return false;
  }

  // 如果属性名是 UI 相关的，且值是完整句子，跳过
  if (propertyName && UI_PROPERTY_NAMES.has(propertyName.toLowerCase())) {
    if (isCompleteSentence(value)) {
      return false;
    }
  }

  // 跳过空值或太短的值
  if (value.length < 16) {
    return false;
  }

  // 跳过 URL（可能包含看起来像密钥的片段）
  if (/^https?:\/\//i.test(value)) {
    return false;
  }

  // 跳过文件路径
  if (/[\/\\]/.test(value)) {
    return false;
  }

  // 特定前缀检查（高置信度）
  const SECRET_PREFIXES = [
    'sk_', 'pk_', 'AKIA', 'AIza', 'ya29.',
    'ghp_', 'gho_', 'github_pat_', 'xoxb-', 'xoxp-',
  ];
  if (SECRET_PREFIXES.some(prefix => value.startsWith(prefix))) {
    return true;
  }

  // 检查是否匹配任何密钥模式
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      // Base64 模式需要额外验证（避免误报）
      if (pattern === SECRET_PATTERNS[SECRET_PATTERNS.length - 1]) {
        // 这是 base64 模式，需要更严格的检查
        const entropy = calculateEntropy(value);
        if (entropy > 4.5 && value.length >= 32) {
          return true;
        }
      } else {
        return true;
      }
    }
  }

  // 熵值检测（随机性高的字符串）
  if (value.length >= 32) {
    const entropy = calculateEntropy(value);
    if (entropy > 4.5) {
      // 高熵值 + 长度足够，可能是密钥
      return true;
    }
  }

  // 检查是否包含高熵值（看起来像随机字符串）
  // 使用简单启发式：如果字符串很长且包含多种字符类型
  if (value.length >= 24) {
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasDigit = /[0-9]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);

    // 如果包含至少 3 种字符类型且长度足够，可能是密钥
    const charTypeCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
    if (charTypeCount >= 3 && value.length >= 32) {
      const entropy = calculateEntropy(value);
      if (entropy > 4.0) {
        return true;
      }
    }
  }

  return false;
}

function isSuspiciousKeyName(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_KEYS.some((key) => lower.includes(key.toLowerCase()));
}

function isStringLikeLiteral(node: BaseASTNode | null | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Literal' && typeof (node as Literal).value === 'string') return true;
  if (node.type === 'TemplateLiteral') {
    // 只有当模板字符串没有表达式时才检查
    const templateLit = node as TemplateLiteral;
    return templateLit.expressions.length === 0;
  }
  return false;
}

function getStringValue(node: BaseASTNode | null | undefined): string | null {
  if (!node) return null;

  if (node.type === 'Literal' && typeof (node as Literal).value === 'string') {
    return (node as Literal).value as string;
  }

  if (node.type === 'TemplateLiteral') {
    const templateLit = node as TemplateLiteral;
    if (templateLit.expressions.length === 0 && templateLit.quasis.length > 0) {
      const cooked = templateLit.quasis[0].value.cooked;
      return cooked ?? null;
    }
  }

  return null;
}

function reportIssue(
  context: AstRuleContext,
  line: number,
  message: string,
  suggestion?: string,
): void {
  context.report({
    line,
    category: 'security',
    ruleId: 'security/no-hardcoded-secrets',
    severity: 'error' as IssueSeverity,
    message,
    suggestion,
    fixSuggestion: {
      title: '将硬编码密钥移到环境变量',
      description: '硬编码的密钥、令牌等敏感信息会被提交到代码仓库，存在泄露风险。应将其移至环境变量或配置文件。',
      fixType: 'manual' as const,
      codeExample: {
        before: `// 危险：硬编码密钥
const apiKey = 'sk_live_abcd1234efgh5678';
const config = {
  secret: 'my-secret-token-12345'
};`,
        after: `// 安全：使用环境变量
const apiKey = process.env.API_KEY;
const config = {
  secret: process.env.SECRET_TOKEN
};`,
      },
      references: [
        { title: 'MDN - process.env', url: 'https://nodejs.org/api/process.html#process_process_env' },
        { title: 'OWASP - Sensitive Data Exposure', url: 'https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure' },
      ],
    },
  });
}

export const noHardcodedSecretsRule: RuleDefinition<AstRuleContext> = {
  id: 'security/no-hardcoded-secrets',
  create(context: AstRuleContext) {
    return {
      Property(node: BaseASTNode) {
        const propNode = node as Property;
        const key = propNode.key;
        const value = propNode.value as BaseASTNode | null;

        let keyName: string | undefined;

        if (key) {
          if (key.type === 'Identifier') {
            keyName = (key as Identifier).name;
          } else if (key.type === 'Literal' && typeof (key as Literal).value === 'string') {
            keyName = (key as Literal).value as string;
          }
        }

        if (!keyName) return;

        const suspiciousName = isSuspiciousKeyName(keyName);
        const stringValue = getStringValue(value);
        const looksLikeSecretValue = stringValue && looksLikeSecret(stringValue, keyName, context.filePath);

        if (suspiciousName && isStringLikeLiteral(value)) {
          if (looksLikeSecretValue) {
            const line = node.loc?.start?.line ?? 1;
            reportIssue(
              context,
              line,
              `检测到硬编码密钥：属性 "${keyName}" 包含疑似密钥值。`,
              `请将密钥移至环境变量或配置文件，避免硬编码到代码中。`,
            );
          } else if (stringValue !== null && stringValue.length >= 16) {
            // 只有当值足够长时才警告（避免误报短字符串）
            const line = node.loc?.start?.line ?? 1;
            reportIssue(
              context,
              line,
              `属性 "${keyName}" 可能包含硬编码敏感信息。`,
              `请确认该值是否为敏感信息，如果是，请移至环境变量或配置文件。`,
            );
          }
        } else if (!suspiciousName && looksLikeSecretValue) {
          // 变量名不可疑但值看起来像密钥
          const line = node.loc?.start?.line ?? 1;
          reportIssue(
            context,
            line,
            `属性 "${keyName}" 包含疑似硬编码密钥值。`,
            `该值看起来像是密钥或令牌，请移至环境变量或配置文件。`,
          );
        }
      },

      VariableDeclarator(node: BaseASTNode) {
        const varDeclarator = node as VariableDeclarator;
        const id = varDeclarator.id;
        const init = varDeclarator.init as BaseASTNode | null;

        if (!id || id.type !== 'Identifier') return;

        const name = (id as Identifier).name;
        const suspiciousName = isSuspiciousKeyName(name);
        const stringValue = getStringValue(init);
        const looksLikeSecretValue = stringValue && looksLikeSecret(stringValue, name, context.filePath);

        if (suspiciousName && isStringLikeLiteral(init)) {
          if (looksLikeSecretValue) {
            const line = node.loc?.start?.line ?? 1;
            reportIssue(
              context,
              line,
              `检测到硬编码密钥：变量 "${name}" 包含疑似密钥值。`,
              `请将密钥移至环境变量或配置文件，避免硬编码到代码中。`,
            );
          } else if (stringValue !== null && stringValue.length >= 16) {
            // 只有当值足够长时才警告（避免误报短字符串）
            const line = node.loc?.start?.line ?? 1;
            reportIssue(
              context,
              line,
              `变量 "${name}" 可能包含硬编码敏感信息。`,
              `请确认该值是否为敏感信息，如果是，请移至环境变量或配置文件。`,
            );
          }
        } else if (!suspiciousName && looksLikeSecretValue) {
          // 变量名不可疑但值看起来像密钥
          const line = node.loc?.start?.line ?? 1;
          reportIssue(
            context,
            line,
            `变量 "${name}" 包含疑似硬编码密钥值。`,
            `该值看起来像是密钥或令牌，请移至环境变量或配置文件。`,
          );
        }
      },
    };
  },
};
