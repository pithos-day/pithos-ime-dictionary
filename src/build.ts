import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseDictionary, toTsv } from './dictionary.ts';

const SOURCE_DIR = 'dictionaries';
const OUT_DIR = 'dist';

const files = (await readdir(SOURCE_DIR)).filter((file) => file.endsWith('.json')).sort();

// 全部の辞書を検証してから書き出す
const errors: string[] = [];
const outputs: { name: string; tsv: string; count: number }[] = [];
for (const file of files) {
  const source = join(SOURCE_DIR, file);
  try {
    const entries = parseDictionary(JSON.parse(await readFile(source, 'utf8')), source);
    outputs.push({ name: `${basename(file, '.json')}.tsv`, tsv: toTsv(entries), count: entries.length });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
for (const { name, tsv, count } of outputs) {
  await writeFile(join(OUT_DIR, name), tsv);
  console.log(`${join(OUT_DIR, name)}: ${count} 件`);
}
