import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const dir = 'public'
const files = (await readdir(dir)).filter(f => f.endsWith('.json'))
let hasError = false

for (const file of files) {
  const path = join(dir, file)
  try {
    JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    hasError = true
    console.error(`❌ ${path}: ${e.message}`)
  }
}

if (hasError) {
  process.exit(1)
} else {
  console.log(`✅ ${files.length} JSON file(s) in ${dir}/ validated successfully`)
}
