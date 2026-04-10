# AST Lint 配置文件使用指南

## 配置文件位置

AICR 会按以下优先级查找配置文件：

1. `.astlintrc.json`（推荐）
2. `.astlintrc`
3. `astlint.config.json`

配置文件会从当前目录向上查找，直到找到为止。

## 快速开始

复制示例配置文件：

```bash
cp .astlintrc.example.json .astlintrc.json
```

## 配置项说明

### 1. 默认设置 (defaults)

```json
{
  "defaults": {
    "checkMode": "staged",
    "failOnWarnings": false,
    "ignorePatterns": [
      "**/node_modules/**",
      "**/.output/**",
      "**/dist/**",
      "**/.nuxt/**"
    ],
    "concurrency": 5,
    "maxFiles": 1000,
    "maxFileSize": 1048576
  }
}
```

- **ignorePatterns**: 忽略的文件模式（glob 格式）
  - 默认已忽略：`node_modules`, `.output`, `dist`, `build`, `.nuxt`, `.next`, `coverage`
  - 支持通配符：`**/*.min.js`, `**/test/**`
- **concurrency**: 并发分析文件数（默认 5）
- **maxFiles**: 最大分析文件数（默认 1000）

### 2. 规则配置 (rules)

#### 禁用规则

```json
{
  "rules": {
    "concern": {
      "maintainability": {
        "rules": {
          "magic-number": {
            "enabled": false
          }
        }
      }
    }
  }
}
```

#### 修改严重度

```json
{
  "rules": {
    "concern": {
      "maintainability": {
        "rules": {
          "integer-pixel-units": {
            "enabled": true,
            "severity": "info"
          }
        }
      }
    }
  }
}
```

可选值：`"error"`, `"warning"`, `"info"`

#### 自定义规则参数

```json
{
  "rules": {
    "concern": {
      "maintainability": {
        "rules": {
          "magic-number": {
            "enabled": true,
            "severity": "info",
            "params": {
              "allowedNumbers": [0, 1, -1, 2, 10, 100],
              "ignorePatterns": ["index", "length"]
            }
          },
          "long-function": {
            "enabled": true,
            "severity": "warning",
            "params": {
              "maxLines": 50
            }
          }
        }
      }
    }
  }
}
```

### 3. 报告配置 (reporting)

```json
{
  "reporting": {
    "autoSave": false,
    "saveDir": ".ast-lint/reports",
    "defaultFormat": "markdown",
    "verbose": false,
    "showProgress": true,
    "maxReports": 10
  }
}
```

### 4. 缓存配置 (cache)

```json
{
  "cache": {
    "enabled": true,
    "maxAge": 604800000,
    "location": ".ast-lint/cache"
  }
}
```

## 常见场景

### 场景 1: 忽略构建产物

**问题**: 扫描时包含了 `.output/` 目录，产生大量误报

**解决方案**:

```json
{
  "defaults": {
    "ignorePatterns": [
      "**/.output/**",
      "**/.nuxt/**",
      "**/dist/**",
      "**/*.min.js"
    ]
  }
}
```

### 场景 2: 降低 magic-number 噪音

**问题**: `magic-number` 规则报告了 17,852 个问题

**解决方案**:

```json
{
  "rules": {
    "concern": {
      "maintainability": {
        "rules": {
          "magic-number": {
            "enabled": true,
            "severity": "info",
            "params": {
              "allowedNumbers": [0, 1, -1, 2, 10, 24, 60, 100, 1000]
            }
          }
        }
      }
    }
  }
}
```

### 场景 3: 只检查特定类别

**问题**: 只想检查安全和可访问性问题

**解决方案**:

```json
{
  "rules": {
    "concern": {
      "maintainability": {
        "enabled": false
      },
      "performance": {
        "enabled": false
      },
      "security": {
        "enabled": true
      },
      "accessibility": {
        "enabled": true
      }
    }
  }
}
```

### 场景 4: 针对特定文件自定义规则

**问题**: `MediaLogo.vue` 是纯装饰性组件，不需要 alt 文本

**解决方案**: 使用行内注释

```vue
<!-- ast-lint-disable-next-line accessibility/alt-text-required -- 装饰性 logo -->
<img src="logo.png">
```

或使用 MCP 工具：

```typescript
mcp__ast_lint__ignore_issue({
  filePath: "app/components/MediaLogo.vue",
  line: 15,
  ruleId: "accessibility/alt-text-required",
  reason: "装饰性 logo"
})
```

## 规则列表

### 可维护性 (maintainability)

- `magic-number` - 魔法数字
- `integer-pixel-units` - 整数像素单位
- `long-function` - 函数过长
- `complex-function` - 函数复杂度过高
- `many-parameters` - 参数过多
- `deep-nesting` - 嵌套过深
- `prefer-early-return` - 建议提前返回
- `no-large-z-index` - z-index 过大

### 安全性 (security)

- `no-hardcoded-secrets` - 硬编码密钥
- `no-eval` - 禁止使用 eval
- `no-implicit-global` - 隐式全局变量

### 性能 (performance)

- `missing-lazy-load` - 缺少懒加载
- `no-unnecessary-reactive` - 不必要的响应式

### 可访问性 (accessibility)

- `alt-text-required` - 图片缺少 alt 文本
- `button-has-type` - 按钮缺少 type 属性

### Vue 框架 (vue)

- `no-timer-without-cleanup` - 定时器未清理
- `no-v-for-index-as-key` - v-for 使用 index 作为 key
- `vue-no-v-if-with-v-for` - v-if 与 v-for 同时使用
- `prefer-v-once` - 建议使用 v-once

## 验证配置

创建配置文件后，运行分析验证：

```bash
# 分析单个文件
mcp__ast_lint__analyze_file --filePath app/pages/index.vue

# 分析目录
mcp__ast_lint__analyze_directory --path app/pages --format summary
```

检查日志输出，确认配置生效：

```
[AST Lint MCP] Found 100 files, analyzing 100
```

如果之前是 595 个文件，现在是 100 个，说明 `ignorePatterns` 生效了。

## 团队协作

将 `.astlintrc.json` 提交到 git：

```bash
git add .astlintrc.json
git commit -m "chore: 添加 AST Lint 配置文件"
```

团队成员拉取后，配置会自动生效。

## 故障排查

### 配置未生效

1. 检查配置文件位置是否正确
2. 检查 JSON 格式是否有效（使用 `jq . .astlintrc.json` 验证）
3. 查看日志输出，确认配置文件被加载

### 忽略模式不工作

1. 确认使用了正确的 glob 格式：`**/.output/**`
2. 路径是相对于项目根目录的
3. 使用 `**/` 前缀匹配任意深度的目录

## 更多信息

- 示例配置：`.astlintrc.example.json`
- 反馈文档：`ast-lint-feedback.md`
- 测试指南：`TEST_GUIDE.md`
