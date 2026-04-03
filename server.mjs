import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT || 3000)

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
}

function safeAssetPath(urlPath) {
  const decoded = decodeURIComponent(urlPath)
  const withoutLeadingSlash = decoded.replace(/^[/\\]+/, '')
  const normalized = path.normalize(withoutLeadingSlash).replace(/^(\.\.[/\\])+/, '')
  return path.join(DIST_DIR, normalized)
}

async function sendFile(res, filePath, fallbackToIndex = false) {
  try {
    const data = await fs.readFile(filePath)
    const extension = path.extname(filePath).toLowerCase()
    res.statusCode = 200
    res.setHeader('Content-Type', MIME_TYPES[extension] || 'application/octet-stream')
    res.end(data)
    return
  } catch (error) {
    if (error?.code === 'ENOENT' && fallbackToIndex) {
      const indexPath = path.join(DIST_DIR, 'index.html')
      const index = await fs.readFile(indexPath)
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(index)
      return
    }

    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not found')
  }
}

export function createMemactServer() {
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://memact.local')
    const assetPath = safeAssetPath(requestUrl.pathname)
    const looksLikeAsset = path.extname(requestUrl.pathname) !== ''

    await sendFile(res, looksLikeAsset ? assetPath : path.join(DIST_DIR, 'index.html'), !looksLikeAsset)
  })
}

const thisFilePath = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === thisFilePath) {
  createMemactServer().listen(PORT, () => {
    console.log(`Memact server listening on http://localhost:${PORT}`)
  })
}
