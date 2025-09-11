const nodeCrypto = require('node:crypto')

if (process.argv.length !== 3) {
  process.exit(1)
}

function generateHash(input) {
  const hash = nodeCrypto.createHash('sha256')
  hash.update('crx' + input)
  return hash.digest('hex')
}

const arg = process.argv[2]
const hash = generateHash(arg)
