const fs = require('fs')
const path = require('path')

function cleanDirectory(dirPath) {
  const resolvedPath = path.resolve(dirPath)

  const parentDir = path.basename(path.dirname(resolvedPath))
  if (parentDir !== 'packages') {
    return
  }

  const distPath = path.join(resolvedPath, 'dist')

  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true })
  }
}

cleanDirectory(process.cwd())
