import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const root = process.argv[2] ?? 'books/zig-blockchain';
const dom = new JSDOM('<!doctype html><html><body></body></html>');

for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  Element: dom.window.Element,
  SVGElement: dom.window.SVGElement,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true });
}

const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false });

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

let blocks = 0;
let failures = 0;

for (const file of walk(root).filter((entry) => entry.endsWith('.md'))) {
  const source = fs.readFileSync(file, 'utf8');

  for (const match of source.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)) {
    blocks += 1;
    const line = source.slice(0, match.index).split('\n').length;

    try {
      await mermaid.parse(match[1]);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${file}:${line}\n${error?.message ?? error}`);
    }
  }
}

console.log(`Mermaid: ${blocks} block(s), ${failures} failure(s)`);

if (failures > 0) {
  process.exitCode = 1;
}
