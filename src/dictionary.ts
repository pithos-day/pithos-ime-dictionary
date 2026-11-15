import { isPos, type Pos } from './pos.ts';

export type DictionaryEntry = {
  reading: string;
  word: string;
  pos: Pos;
  comment?: string;
};

/** Mozc の UserDictionaryUtil と同じ上限（UTF-8 のバイト数） */
const MAX_FIELD_BYTES = 300;
const INVALID_CHARS = /[\t\n\r]/;

/** Mozc の NormalizeReading のうち、全角英数とカタカナの変換だけを行う */
const normalizeReading = (reading: string): string =>
  reading
    .replace(/[！-～]/g, (c) => String.fromCodePoint(c.charCodeAt(0) - 0xfee0))
    .replace(/[ァ-ヶ]/g, (c) => String.fromCodePoint(c.charCodeAt(0) - 0x60));

/** Mozc の IsValidReading で許される文字（ASCII、ひらがな、゛゜、・ー、、。、「」『』、〜） */
const VALID_READING = /^[!-~ぁ-ゖ゛゜・ー、。「-』〜]+$/;

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

const validateField = (name: string, value: unknown, required: boolean): string[] => {
  if (value === undefined && !required) return [];
  if (typeof value !== 'string') return [`${name} は文字列にする`];
  if (required && value === '') return [`${name} が空`];
  const errors: string[] = [];
  if (INVALID_CHARS.test(value)) errors.push(`${name} にタブか改行が含まれている`);
  if (byteLength(value) > MAX_FIELD_BYTES) errors.push(`${name} が ${MAX_FIELD_BYTES} バイトを超えている`);
  return errors;
};

const validateEntry = (entry: unknown): string[] => {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return ['エントリーはオブジェクトにする'];
  const { reading, word, pos, comment, ...rest } = entry as Record<string, unknown>;
  const errors = [
    ...validateField('reading', reading, true),
    ...validateField('word', word, true),
    ...validateField('comment', comment, false),
  ];
  if (typeof reading === 'string' && reading !== '') {
    if (!VALID_READING.test(normalizeReading(reading))) errors.push(`reading に使えない文字がある: ${reading}`);
    // TSV では # で始まる行がコメントとして読み飛ばされる
    if (reading.startsWith('#')) errors.push('reading を # で始めることはできない');
  }
  if (typeof pos !== 'string' || !isPos(pos)) errors.push(`pos が Mozc の品詞ではない: ${String(pos)}`);
  for (const key of Object.keys(rest)) errors.push(`未知のキー: ${key}`);
  return errors;
};

/** JSON を読み込んだ値を検証して、エントリーの配列を返す。問題があれば全部まとめて投げる */
export const parseDictionary = (data: unknown, source: string): DictionaryEntry[] => {
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { entries?: unknown }).entries)) {
    throw new Error(`${source}: { "entries": [...] } の形にする`);
  }
  const entries: unknown[] = (data as { entries: unknown[] }).entries;
  const errors: string[] = [];
  const seen = new Map<string, number>();
  entries.forEach((entry, index) => {
    const entryErrors = validateEntry(entry);
    if (entryErrors.length === 0) {
      const { reading, word, pos } = entry as DictionaryEntry;
      const key = [normalizeReading(reading), word, pos].join('\t');
      const first = seen.get(key);
      if (first === undefined) seen.set(key, index);
      else entryErrors.push(`entries[${first}] と重複している`);
    }
    for (const error of entryErrors) errors.push(`${source}: entries[${index}]: ${error}`);
  });
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return entries as DictionaryEntry[];
};

/** Mozc のインポート形式（読み・単語・品詞・コメントのタブ区切り、UTF-8）に変換する */
export const toTsv = (entries: readonly DictionaryEntry[]): string =>
  entries.map(({ reading, word, pos, comment = '' }) => `${reading}\t${word}\t${pos}\t${comment}\n`).join('');
