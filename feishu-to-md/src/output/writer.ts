import fs from 'fs/promises'
import path from 'path'

export interface WriteMarkdownOptions {
  outputPath?: string
  filename?: string
  content: string
}

export async function writeMarkdown(options: WriteMarkdownOptions): Promise<string> {
  const { content, outputPath, filename } = options

  // Default output directory
  const outputDir = outputPath ?? path.join(process.cwd(), 'output')

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true })

  // Generate filename if not provided
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const finalFilename = filename ?? `feishu-doc-${timestamp}.md`

  const filePath = path.join(outputDir, finalFilename)

  // Write markdown content
  await fs.writeFile(filePath, content, 'utf-8')

  return filePath
}

export async function downloadImage(url: string, outputDir: string, filename: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  const filePath = path.join(outputDir, filename)

  await fs.writeFile(filePath, Buffer.from(buffer))

  return filePath
}
