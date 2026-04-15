import type { ConversionOptions, ConversionResult } from '../types'
import { BrowserController } from '../browser/controller'
import { writeMarkdown } from '../output/writer'
import { getConfig } from '../config'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function convertFeishuDoc(
  options: ConversionOptions
): Promise<ConversionResult> {
  const config = getConfig()
  const documentTimeout = options.documentTimeout ?? config.documentTimeout

  const controller = new BrowserController({
    browserType: options.browserType,
    cdpPort: options.cdpPort,
  })

  try {
    // Connect and open the Feishu document page
    await controller.openPage(options.url)

    // Determine effective timeout: if waiting for login, use the longer loginTimeout
    const effectiveTimeout = options.waitForManualLogin
      ? (options.loginTimeout ?? config.loginTimeout)
      : documentTimeout

    if (options.waitForManualLogin) {
      console.error('Please log in to Feishu in the browser window...')
      console.error('Waiting for login and document to load...')
    }

    // Wait for document readiness
    const isReady = await controller.waitForDocumentReady(effectiveTimeout)

    if (!isReady) {
      return {
        success: false,
        error: 'Document failed to load. Please check if you have access to the document.',
      }
    }

    console.error('Converting document to Markdown...')

    // Load the converter script
    const converterScriptPath = path.join(__dirname, 'browser-injected.js')
    let converterScript: string
    try {
      converterScript = await fs.readFile(converterScriptPath, 'utf-8')
    } catch {
      converterScript = await getInlineConverterScript()
    }

    // Step 1: Inject the IIFE converter script (self-executes, sets window.__feishuConverter)
    await controller.evaluate(converterScript)

    // Step 2: Scroll document to bottom to trigger lazy-loaded blocks (tables, images, etc.)
    console.error('Scrolling document to load all blocks...')
    await controller.evaluate(`
      (async function() {
        var container = document.querySelector('#mainBox .bear-web-x-container');
        if (!container) return;

        // Scroll down in steps to trigger lazy loading
        var scrollStep = container.clientHeight;
        var maxScroll = container.scrollHeight;
        var currentScroll = 0;

        while (currentScroll < maxScroll) {
          currentScroll = Math.min(currentScroll + scrollStep, maxScroll);
          container.scrollTo({ top: currentScroll });
          // Brief pause to let Feishu load content at this scroll position
          await new Promise(function(r) { setTimeout(r, 300); });
          // scrollHeight may grow as content loads
          maxScroll = container.scrollHeight;
        }

        // Scroll back to top
        container.scrollTo({ top: 0 });
      })()
    `)

    // Step 3: Wait for all blocks (including nested table cells) to finish loading
    console.error('Waiting for all blocks to be ready...')
    await controller.waitForFunction(
      `(function() {
        var pm = window.PageMain;
        if (!pm || !pm.blockManager || !pm.blockManager.rootBlockModel) return false;

        function allReady(block) {
          if (block.snapshot && block.snapshot.type === 'pending') return false;
          if (block.children && Array.isArray(block.children)) {
            for (var i = 0; i < block.children.length; i++) {
              if (!allReady(block.children[i])) return false;
            }
          }
          return true;
        }

        return allReady(pm.blockManager.rootBlockModel);
      })()`,
      documentTimeout,
    )

    // Step 4: Run conversion
    const result = await controller.evaluate<any>(`
      (async function() {
        var w = window;
        if (w.__feishuConverter && w.__feishuConverter.convertToMarkdown) {
          return await w.__feishuConverter.convertToMarkdown();
        }

        // Fallback: basic text extraction
        var rootBlock = w.PageMain && w.PageMain.blockManager && w.PageMain.blockManager.rootBlockModel;
        if (!rootBlock) {
          throw new Error('Root block not found and converter bundle unavailable');
        }

        var title = document.title || 'Untitled';
        var markdown = '# ' + title + '\\n\\n';

        function extractText(block) {
          var text = '';
          if (block.zoneState && block.zoneState.allText) {
            text += block.zoneState.allText + '\\n\\n';
          }
          if (block.children && Array.isArray(block.children)) {
            for (var i = 0; i < block.children.length; i++) {
              text += extractText(block.children[i]);
            }
          }
          return text;
        }

        markdown += extractText(rootBlock);
        return { title: title, markdown: markdown };
      })()
    `)

    // Write markdown to file
    const outputPath = options.outputPath ?? config.defaultOutputPath
    const markdownPath = await writeMarkdown({
      outputPath,
      content: result.markdown,
      filename: `${result.title
        .replace(/[\/\\:*?"<>|]/g, '')  // remove chars invalid in filenames
        .replace(/\s+/g, ' ')           // collapse whitespace
        .trim()}.md`,
    })

    // Write file attachments
    if (result.attachments?.length) {
      for (const attachment of result.attachments) {
        const attachPath = path.join(outputPath, attachment.name)
        await fs.mkdir(path.dirname(attachPath), { recursive: true })
        await fs.writeFile(attachPath, Buffer.from(attachment.data))
      }
    }

    const debugInfo = `attachments downloaded: ${result.attachments?.length ?? 0}`

    if (options.closeBrowser) {
      await controller.close()
    }

    return {
      success: true,
      markdownPath,
      debugInfo,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function getInlineConverterScript(): Promise<string> {
  return `
    var w = window;
    w.__feishuConverter = {
      convertToMarkdown: function() {
        var rootBlock = w.PageMain && w.PageMain.blockManager && w.PageMain.blockManager.rootBlockModel;
        if (!rootBlock) {
          throw new Error('Root block not found. Please rebuild the project to get the full converter bundle.');
        }
        var title = document.title || 'Untitled';
        var markdown = '# ' + title + '\\n\\n';
        markdown += '> Note: Using fallback text extraction. Run pnpm build for full Markdown conversion.\\n\\n';
        function extractText(block) {
          var text = '';
          if (block.zoneState && block.zoneState.allText) {
            text += block.zoneState.allText + '\\n\\n';
          }
          if (block.children && Array.isArray(block.children)) {
            for (var i = 0; i < block.children.length; i++) {
              text += extractText(block.children[i]);
            }
          }
          return text;
        }
        markdown += extractText(rootBlock);
        return { title: title, markdown: markdown };
      }
    };
  `
}
