import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { convertFeishuDoc } from './tools/convert.js'

const server = new Server(
  {
    name: 'feishu-to-md-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'convert_feishu_doc',
        description:
          'Convert a Feishu/Lark document to Markdown format. Opens a browser window for manual login if needed.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL of the Feishu document to convert',
            },
            outputPath: {
              type: 'string',
              description: 'Optional output directory path (default: ./output)',
            },
            waitForManualLogin: {
              type: 'boolean',
              description: 'Wait for user to manually log in (default: true)',
            },
            browserType: {
              type: 'string',
              enum: ['system', 'chrome', 'edge', 'chromium', 'firefox'],
              description: 'Browser type to use (default: system - auto-detects OS default browser)',
            },
            closeBrowser: {
              type: 'boolean',
              description: 'Close browser after conversion (default: false)',
            },
            cdpPort: {
              anyOf: [
                { type: 'number' },
                { type: 'boolean', enum: [false] },
              ],
              description: 'CDP port to connect to (default: 9222). Set to false to disable CDP and always launch a new browser.',
            },
          },
          required: ['url'],
        },
      },
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'convert_feishu_doc') {
    const args = request.params.arguments as any

    if (!args.url) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: url parameter is required',
          },
        ],
      }
    }

    const result = await convertFeishuDoc({
      url: args.url,
      outputPath: args.outputPath,
      waitForManualLogin: args.waitForManualLogin,
      browserType: args.browserType,
      closeBrowser: args.closeBrowser ?? false,
      cdpPort: args.cdpPort,
    })

    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Successfully converted Feishu document to Markdown.\nOutput file: ${result.markdownPath}\nDebug: ${result.debugInfo ?? 'none'}`,
          },
        ],
      }
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to convert document: ${result.error}`,
          },
        ],
        isError: true,
      }
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `Unknown tool: ${request.params.name}`,
      },
    ],
    isError: true,
  }
})

export async function runServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Feishu to Markdown MCP server running on stdio')
}
