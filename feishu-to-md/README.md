# 飞书文档转 Markdown MCP

[![npm version](https://img.shields.io/npm/v/feishu-to-md-mcp.svg)](https://www.npmjs.com/package/feishu-to-md-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

基于 MCP（Model Context Protocol）的飞书/Lark 文档转 Markdown 工具，通过原生 CDP（Chrome DevTools Protocol）直连浏览器实现文档转换。无需 Playwright，零额外依赖。

## 功能特性

- 将飞书文档转换为 Markdown 格式，保留文档结构
- 自动下载文档中的图片和附件
- 原生 CDP 协议直连，无需安装 Playwright 或下载浏览器
- 自动发现已开启远程调试的 Chrome/Edge 浏览器
- 支持 macOS、Windows、Linux 全平台

## 快速开始

### 方式一：npx（推荐）

无需安装，直接在 MCP 客户端配置中使用：

```json
{
  "mcpServers": {
    "feishu-to-md": {
      "command": "npx",
      "args": ["-y", "feishu-to-md-mcp"]
    }
  }
}
```

### 方式二：全局安装

```bash
npm install -g feishu-to-md-mcp
```

然后在 MCP 客户端配置中添加：

```json
{
  "mcpServers": {
    "feishu-to-md": {
      "command": "feishu-to-md-mcp"
    }
  }
}
```

### 方式三：GitHub 直接引用（适用于内部/私有项目）

```json
{
  "mcpServers": {
    "feishu-to-md": {
      "command": "npx",
      "args": ["github:twoer/feishu-to-md"]
    }
  }
}
```

## 前置准备

使用前需要在浏览器中开启远程调试：

1. 打开 Chrome 或 Edge 浏览器
2. 地址栏输入：
   - Chrome: `chrome://inspect/#remote-debugging`
   - Edge: `edge://inspect/#remote-debugging`
3. 勾选 **"Enable remote debugging"**，确认端口为 `9222`

开启后工具会自动发现并连接浏览器，无需额外配置。

## 工具：convert_feishu_doc

将飞书/Lark 文档转换为 Markdown 格式。

### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | string | 是 | - | 飞书文档 URL |
| `outputPath` | string | 否 | `./output` | 输出目录，用于存放 Markdown 和资源文件 |
| `waitForManualLogin` | boolean | 否 | `true` | 是否等待用户在浏览器中手动登录 |
| `browserType` | string | 否 | `system` | 浏览器类型：`system`、`chrome`、`edge`、`chromium`、`firefox` |
| `closeBrowser` | boolean | 否 | `false` | 转换完成后是否关闭标签页 |
| `cdpPort` | number \| false | 否 | `9222` | CDP 端口号。设为 `false` 禁用 CDP |

### 使用示例

**基本用法：**
```json
{
  "url": "https://example.feishu.cn/docx/xxxxx"
}
```

**指定输出目录：**
```json
{
  "url": "https://example.feishu.cn/docx/xxxxx",
  "outputPath": "./docs/my-document"
}
```

### 输出结构

```
output/
├── document.md          # 转换后的 Markdown 文件
├── images/              # 下载的图片
│   ├── image-1.png
│   └── image-2.jpg
└── files/               # 下载的附件
    └── document.pdf
```

## 环境要求

- Node.js >= 22.0.0
- Chrome 或 Edge 浏览器，已开启远程调试

## 致谢

文档转换核心逻辑参考了 [cloud-document-converter](https://github.com/whale4113/cloud-document-converter) 项目。

## 许可证

MIT
