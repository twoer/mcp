import { defineConfig } from 'tsup'

export default defineConfig([
  // Main MCP server bundle (Node.js)
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    shims: true,
    // No banner here - src/index.ts already has #!/usr/bin/env node shebang
  },
  // Browser-injected bundle (IIFE format for browser context)
  {
    entry: {
      'browser-injected': 'src/browser/bundle.ts',
    },
    format: ['iife'],
    globalName: 'FeishuConverter',
    sourcemap: true,
    clean: false,
    // No shims - runs in browser context
    platform: 'browser',
    outDir: 'dist',
    noExternal: [/.*/], // Bundle all dependencies for browser
    // Override output extension to remove the default '.global' suffix for IIFE
    outExtension: () => ({ js: '.js' }),
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        'process.env.NODE_ENV': '"production"',
      }
    },
  },
])
