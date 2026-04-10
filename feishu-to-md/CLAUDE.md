# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 构建 & 测试命令

```bash
npm run build        # 通过 tsup 构建 ESM 和 IIFE 两种产物
npm run type-check   # TypeScript 类型检查 (tsc --noEmit)
npm run dev          # 开发模式，监听文件变化
```

## 架构概览

这是一个 MCP（Model Context Protocol）服务器，通过 CDP (Chrome DevTools Protocol) 直连浏览器，将飞书/Lark 文档转换为 Markdown。无需 Playwright，使用原生 WebSocket + CDP 协议通信。

### 双产物构建

项目通过 tsup 构建**两个独立的产物**：

1. **ESM 产物** (`dist/index.js`) — Node.js MCP 服务器入口
2. **IIFE 产物** (`dist/browser-injected.js`) — 注入到浏览器页面上下文，访问飞书内部 API

IIFE 产物是必需的，因为它需要访问 `window.PageMain` 等仅存在于浏览器上下文中的飞书全局变量。

### 数据流

```
MCP 客户端请求
       ↓
  server.ts (MCP 工具处理器)
       ↓
  convert.ts (协调器)
       ↓
  BrowserController → 原生 WebSocket + CDP → 打开飞书文档
       ↓
  Runtime.evaluate() 注入 browser-injected.js
       ↓
  bundle.ts 访问 window.PageMain
       ↓
  docx.ts 转换为 mdast → Markdown 字符串
       ↓
  下载图片/文件为字节数组
       ↓
  返回给 Node.js → 写入 .md + images/ + files/
```

### 核心模块

| 路径 | 职责 |
|------|------|
| `src/server.ts` | MCP 服务器定义，工具 schema |
| `src/browser/controller.ts` | 原生 CDP WebSocket 客户端，浏览器连接，页面控制 |
| `src/browser/bundle.ts` | 在浏览器上下文运行，访问 `window.PageMain`，转换文档 |
| `src/converter/docx.ts` | Block 类型处理器，mdast 转换，文档结构 |
| `src/converter/env.ts` | 从页面全局变量初始化 Lark 环境 |

### 浏览器连接

项目通过原生 WebSocket 直连已开启远程调试的 Chrome/Edge 浏览器：

1. 用户在浏览器中打开 `chrome://inspect/#remote-debugging`（或 `edge://inspect`）开启远程调试
2. 从 `DevToolsActivePort` 文件读取 WebSocket URL
3. 通过 CDP 协议控制浏览器：创建标签页、导航、注入 JS

无需安装 Playwright 或下载浏览器。

### Block 类型

飞书文档由 Block（`BlockType`）组成。每种 block 类型（text、heading、table、image、file 等）在 `docx.ts` 中有对应的处理器，将其转换为 mdast 节点。最终通过 `mdast-util-to-markdown` 生成字符串。

### 图片/文件下载

图片和文件在浏览器上下文中使用 `fetch()` 配合 `credentials: 'include'` 下载，然后作为字节数组传输到 Node.js。MCP 服务器将它们写入 `output/images/` 和 `output/files/`。

## 重要约束

- IIFE 产物必须保持自包含（无外部依赖）— 见 tsup.config.ts 中的 `noExternal: [/.*/]`
- 浏览器上下文代码不能使用 Node.js API
- 图片 URL 需要 `credentials: 'include'` 进行认证
