import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { readdir } from 'node:fs/promises';

const outputDir = join(process.cwd(), '.output');
const textExtensions = new Set(['.js', '.json', '.html', '.css', '.svg']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }

    if (!textExtensions.has(extname(entry.name))) continue;

    const source = await readFile(path, 'utf8');
    const sanitized = source.replaceAll('\uFFFF', '\\uFFFF');
    if (sanitized !== source) {
      await writeFile(path, sanitized, 'utf8');
      console.log(`[Carrot Build] Sanitized U+FFFF: ${path}`);
    }
  }
}

await walk(outputDir);
