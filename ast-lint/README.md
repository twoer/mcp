# AST Lint MCP Server

AST Lint 的 Model Context Protocol (MCP) 服务器实现，让 Claude Code 和其他 MCP 客户端能够直接调用 AST Lint 的静态代码分析能力。

## ✨ 特性

- 🔍 **34 条代码质量规则**：安全、可维护性、性能、可访问性、Vue 特定问题
- ⚡ **本地运行**：无需远程服务器，数据不离开本地
- 🚀 **常驻进程**：快速响应（~50ms），无启动开销
- 🔧 **灵活过滤**：按类别、严重程度过滤问题
- 📦 **批量分析**：支持目录批量分析和 git diff 增量分析
- 🤖 **AI 集成**：Claude 自动决定何时调用分析工具

## 📋 前置要求

- Node.js >= 18

## 📦 安装

### 方式一：npx 直接使用（推荐）

无需安装，直接在配置中使用：

```json
{
  "mcpServers": {
    "ast-lint": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "ast-lint-mcp"]
    }
  }
}
```

### 方式二：全局安装

```bash
npm install -g ast-lint-mcp
```

然后配置：

```json
{
  "mcpServers": {
    "ast-lint": {
      "type": "stdio",
      "command": "ast-lint-mcp"
    }
  }
}
```

## ⚙️ 配置

### 配置文件位置

MCP Server 的配置文件是 `~/.claude.json`

### 配置后重启

保存配置文件后，重启 Claude Code 以加载 MCP Server。

### AST Lint 规则配置（可选）

AST Lint 支持通过配置文件自定义规则行为。在项目根目录创建 `.astlintrc.json` 文件：

```json
{
  "version": "0.6.0",
  "defaults": {
    "ignorePatterns": ["node_modules/**", "dist/**"],
    "concurrency": 5
  },
  "rules": {
    "concern": {
      "security": {
        "enabled": true,
        "rules": {
          "no-hardcoded-secrets": {
            "enabled": true,
            "severity": "error"
          }
        }
      },
      "maintainability": {
        "enabled": true,
        "rules": {
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

**配置文件查找顺序：**
1. `.astlintrc.json`
2. `.astlintrc`
3. `astlint.config.json`

配置文件会从当前目录向上查找，直到找到为止。

**可配置项：**
- `defaults.ignorePatterns` - 忽略的文件模式
- `defaults.concurrency` - 并发分析数量
- `rules.*.enabled` - 启用/禁用规则组
- `rules.*.rules.*.enabled` - 启用/禁用单个规则
- `rules.*.rules.*.severity` - 规则严重程度（error/warning/info）
- `rules.*.rules.*.params` - 规则参数

查看完整配置示例：`.astlintrc.example.json`

## 🚀 使用

### 验证安装

在 Claude Code 中运行：

```
/mcp list
```

应该看到 `ast-lint` 在 MCP 服务器列表中。

### 常用场景

AST Lint 已集成到 Claude Code，你只需要用自然语言描述需求，Claude 会自动调用合适的工具。

#### 场景 1：全量分析当前项目

```
使用 ast-lint 帮我全量分析一下当前项目
```

```
用 ast-lint 检查一下整个项目的代码质量
```

```
帮我分析一下项目里有哪些安全问题
```

**Claude 会做什么：**
- 自动扫描项目目录（跳过 node_modules、dist 等构建产物）
- 生成汇总报告（Top Issues、Top Files）
- 按严重程度分类问题（Error、Warning、Info）

---

#### 场景 2：分析未提交的代码

```
使用 ast-lint 帮我分析一下未提交的代码
```

```
检查一下我刚改的代码有没有问题
```

```
分析一下 git diff 里的变更
```

**Claude 会做什么：**
- 只分析 git diff 中的变更文件
- 只检查新增或修改的代码行（增量分析）
- 快速反馈，适合提交前检查

---

#### 场景 3：分析指定目录

```
使用 ast-lint 帮我分析一下 src/components 目录
```

```
检查一下 app/pages 下的 Vue 文件
```

```
分析 server/api 目录的安全问题
```

**Claude 会做什么：**
- 扫描指定目录下的所有代码文件
- 支持 glob 模式过滤（如 `**/*.vue`）
- 生成该目录的质量报告

---

#### 场景 4：分析单个文件

```
帮我看看 src/utils/auth.ts 有什么问题
```

```
分析一下这个组件的性能问题：app/components/Header.vue
```

```
检查 server/api/login.post.ts 的安全隐患
```

**Claude 会做什么：**
- 深度分析单个文件
- 返回详细的问题列表和修复建议
- 包含代码示例和参考链接

---

#### 场景 5：生成质量报告

```
生成一份当前项目的代码质量报告
```

```
帮我导出一份 AST Lint 分析报告
```

```
生成 Markdown 格式的质量报告
```

**Claude 会做什么：**
- 全量分析项目代码
- 生成详细的 Markdown 报告（保存到 `.ast-lint/reports/`）
- 包含问题分布、文件排名、修复建议、代码示例

---

#### 场景 6：查看规则说明

```
AST Lint 有哪些规则？
```

```
列出所有安全相关的检查规则
```

```
magic-number 规则是什么意思？
```

**Claude 会做什么：**
- 列出所有可用的代码质量规则
- 支持按类别过滤（security、maintainability、performance、accessibility、vue）
- 提供规则说明和参考文档

---

### 高级用法

#### 指定检查类别

```
只检查安全问题
```

```
分析性能相关的问题
```

```
检查可访问性问题
```

**支持的类别：**
- `security` - 安全性（硬编码密钥、XSS、不安全正则等）
- `maintainability` - 可维护性（魔法数字、长函数、复杂函数等）
- `performance` - 性能（懒加载、不必要的响应式等）
- `accessibility` - 可访问性（alt 文本、button type 等）
- `vue` - Vue 框架（v-for key、定时器清理等）

---

#### 指定严重程度

```
只显示 error 级别的问题
```

```
包括 warning 和 info 级别的问题
```

**严重程度：**
- `error` - 必须修复的问题
- `warning` - 建议修复的问题
- `info` - 可选修复的问题

---

#### 获取修复建议

```
这个问题怎么修复？
```

```
给我看看修复前后的代码对比
```

**Claude 会提供：**
- 修复步骤指导
- 修复前后的代码示例
- 相关的最佳实践文档

---

### 使用技巧

1. **自然语言提问**：直接描述你的需求，不需要记忆工具名称
2. **明确范围**：指定目录、文件或 git diff，避免全量扫描
3. **指定类别**：如"安全问题"、"性能问题"，快速定位关注点
4. **增量分析**：提交前用 git diff 分析，只检查变更代码
5. **定期报告**：每周生成一次质量报告，跟踪改进趋势

---

### 技术参考（开发者）

<details>
<summary>点击展开：MCP 工具列表和参数说明</summary>

#### 1. `analyze_code` - 分析代码片段

**参数：**
- `code` (string, 必需) - 要分析的代码
- `filePath` (string, 必需) - 文件路径（用于确定语言）
- `categories` (array, 可选) - 过滤类别
- `severity` (string, 可选) - 最低严重程度

#### 2. `analyze_file` - 分析文件

**参数：**
- `filePath` (string, 必需) - 文件的绝对路径
- `categories` (array, 可选) - 过滤类别
- `severity` (string, 可选) - 最低严重程度

#### 3. `analyze_directory` - 批量分析目录

**参数：**
- `path` (string, 必需) - 目录路径
- `pattern` (string, 可选) - glob 模式，如 `**/*.vue`
- `categories` (array, 可选) - 过滤类别
- `format` (string, 可选) - 输出格式：`summary`（默认）或 `detailed`
- `maxFiles` (number, 可选) - 最大文件数（默认 100）

#### 4. `analyze_git_diff` - 分析 Git 变更

**参数：**
- `base` (string, 可选) - 基准分支或 commit（默认 `master`）
- `categories` (array, 可选) - 过滤类别
- `onlyChanged` (boolean, 可选) - 只分析变更行（默认 `true`）
- `format` (string, 可选) - 输出格式：`summary`（默认）或 `detailed`

#### 5. `list_rules` - 列出所有规则

**参数：**
- `category` (string, 可选) - 过滤类别

#### 6. `get_fix_suggestion` - 获取修复建议

**参数：**
- `filePath` (string, 必需) - 文件路径
- `line` (number, 必需) - 问题所在行号
- `ruleId` (string, 可选) - 规则 ID

#### 7. `generate_report` - 生成质量报告

**参数：**
- `path` (string, 必需) - 目录路径
- `outputPath` (string, 可选) - 输出文件路径（默认 `.ast-lint/reports/`）

</details>

## ✅ 验证与测试

### 手动测试 MCP Server

```bash
# 测试工具列表
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js

# 测试代码分析
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_code","arguments":{"code":"const x = 1;","filePath":"test.ts"}}}' | node dist/index.js
```

### 运行集成测试

```bash
npm run test:integration
```

预期输出：
```
🚀 AST Lint MCP Server 集成测试
═══════════════════════════════════════════════════════════

🧪 测试: 列出所有规则
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 响应: { "status": "success", "total": 33 }

🧪 测试: 分析包含硬编码密钥的代码
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 响应: { "status": "success", "total": 1 }

📊 测试结果: 4 通过, 0 失败
```

### 在 Claude Code 中验证

1. 重启 Claude Code
2. 运行 `/mcp list` 确认 `ast-lint` 已加载
3. 测试分析：
```
分析这段代码：const apiKey = "sk-123";
```

## ❓ 常见问题

### 安装问题

**Q: npm install 失败，提示权限错误**

A: 使用 `sudo npm install -g` 或配置 npm 全局目录：
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Q: 找不到 ast-lint-mcp 命令**

A: 检查全局安装：
```bash
npm list -g ast-lint-mcp
# 如果没有，重新安装
npm install -g ast-lint-mcp
```

### 配置问题

**Q: MCP Server 未启动**

A:
1. 检查配置文件路径是否正确（`~/.claude.json`）
2. 确认 JSON 格式正确（使用 JSON 验证器）
3. 重启 Claude Code
4. 查看日志：`tail -f ~/.claude/logs/mcp-*.log`

**Q: Claude Code 没有调用工具**

A:
1. 运行 `/mcp list` 确认 ast-lint 已加载
2. 尝试明确要求："使用 AST Lint 分析这段代码"
3. 检查日志文件是否有错误信息

### 使用问题

**Q: 分析结果为空**

A:
- 检查代码是否有实际问题
- 尝试指定类别：`categories: ["security"]`
- 降低严重程度过滤：`severity: "info"`

**Q: 分析速度慢**

A:
- MCP Server 是常驻进程，首次调用后应该很快（~50ms）
- 如果持续慢，检查是否每次都在重启进程
- 确认使用的是构建后的代码（`dist/index.js`）

**Q: 如何更新到最新版本**

A:
```bash
npm install -g ast-lint-mcp@latest
# 重启 Claude Code
```

## 🛠️ 开发

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build

# 测试
npm test
npm run test:integration
```

### 项目结构

```
ast-lint-mcp/
├── src/
│   ├── index.ts          # MCP Server 入口
│   ├── tools/            # 工具实现
│   │   ├── analyze-code.ts
│   │   ├── analyze-file.ts
│   │   └── list-rules.ts
│   └── utils/            # 工具函数
├── test/                 # 测试文件
├── dist/                 # 构建输出
└── package.json
```

### 技术实现

#### analyze_code（分析代码字符串）

**实现方式**：直接使用 AST Lint 底层 API
- `parseCode()` - 解析 AST
- `traverseAst()` - 遍历 AST
- `BUILTIN_RULES` - 应用规则

**优点**：
- ✅ 无需创建临时文件
- ✅ 可以分析任意代码片段
- ✅ 性能好（~50ms）

#### analyze_file（分析文件）

**实现方式**：调用 `runAstAnalysis()`
- 复用完整的分析流程
- 自动处理配置、缓存、并发

**优点**：
- ✅ 代码量少
- ✅ 与 CLI 行为一致
- ✅ 自动支持缓存

#### list_rules（列出规则）

**实现方式**：直接读取 `BUILTIN_RULES`

### 性能对比

| 操作 | CLI 模式 | MCP Server |
|------|---------|-----------|
| 首次调用 | ~500ms | ~50ms |
| 后续调用 | ~500ms | ~50ms |
| 10 个文件 | ~5s | ~500ms |

**性能提升**：10x

## 📚 相关文档

- [AST Lint MCP Server](https://github.com/twoer/mcp/tree/main/ast-lint)
- [MCP 协议规范](https://modelcontextprotocol.io)

## 📄 许可证

MIT

## 🔗 相关链接

- 仓库：[https://github.com/twoer/mcp](https://github.com/twoer/mcp)
