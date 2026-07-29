import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const bookDir = resolve("leanpub/zig-blockchain-en");
const configPath = join(bookDir, "book.yaml");
const errors = [];

const canonicalChapterOrder = [
  "chapter1",
  "code-guide",
  "chapter2",
  "chapter3",
  "chapter4",
  "chapter5",
  "chapter6",
  "chapter7",
  "chapter7-2",
  "chapter8",
  "chapter8-2",
  "chapter9",
  "chapter10",
  "chapter10-2",
  "chapter11",
  "chapter12",
  "chapter13",
  "chapter14",
  "chapter15",
  "chapter16",
];

if (!existsSync(configPath)) {
  throw new Error(`Missing Zig blockchain English book config: ${configPath}`);
}

const config = readFileSync(configPath, "utf8");
const chapterSlugs = [];
let inChapters = false;

for (const line of config.split(/\r?\n/)) {
  if (line === "chapters:") {
    inChapters = true;
    continue;
  }

  if (!inChapters) {
    continue;
  }

  const match = line.match(/^  - ([a-z0-9-]+)$/);
  if (match) {
    chapterSlugs.push(match[1]);
  } else if (line.trim() && !line.startsWith("  ")) {
    break;
  }
}

if (
  !config.includes(
    'title: "Build a Blockchain and a Minimal EVM from Scratch in Zig"',
  )
) {
  errors.push("book.yaml must use the approved English title");
}

if (!config.includes("language: en")) {
  errors.push("book.yaml must declare English as the manuscript language");
}

if (!config.includes("distribution: leanpub")) {
  errors.push("book.yaml must identify Leanpub as the distribution target");
}

if (/^(?:published|price|topics):/m.test(config)) {
  errors.push("book.yaml must not contain Zenn publication metadata");
}

if (existsSync(resolve("books/zig-blockchain-en"))) {
  errors.push("the Leanpub manuscript must not exist under Zenn's books directory");
}

if (chapterSlugs.length < 2) {
  errors.push("the English manuscript must include at least the introduction and code guide");
}

if (chapterSlugs.length > canonicalChapterOrder.length) {
  errors.push(
    `expected at most ${canonicalChapterOrder.length} chapters, found ${chapterSlugs.length}`,
  );
}

for (const [index, slug] of chapterSlugs.entries()) {
  const expectedSlug = canonicalChapterOrder[index];
  if (slug !== expectedSlug) {
    errors.push(
      `chapter ${index + 1} must be ${expectedSlug}, found ${slug}`,
    );
  }
}

for (const slug of chapterSlugs) {
  const file = join(bookDir, `${slug}.md`);
  if (!existsSync(file)) {
    errors.push(`missing chapter file: ${file}`);
    continue;
  }

  const markdown = readFileSync(file, "utf8");

  if (!/^---\r?\ntitle: "[^"]+"\r?\nfree: true\r?\n---\r?\n/.test(markdown)) {
    errors.push(`${file}: invalid frontmatter`);
  }

  if (/[ぁ-んァ-ヶ一-龠々〆ヵヶ]/.test(markdown)) {
    errors.push(`${file}: contains Japanese text`);
  }

  if (/textlint-(?:disable|enable)/.test(markdown)) {
    errors.push(`${file}: contains a textlint suppression comment`);
  }

  if (/\bTODO\b|\bTBD\b|placeholder/i.test(markdown)) {
    errors.push(`${file}: contains unfinished placeholder text`);
  }
}

const introductionPath = join(bookDir, "chapter1.md");
if (existsSync(introductionPath)) {
  const introduction = readFileSync(introductionPath, "utf8");
  if (!introduction.includes("Zig `0.14.0`")) {
    errors.push("chapter1.md must state the pinned Zig 0.14.0 version");
  }
  if (!/learning node/i.test(introduction)) {
    errors.push("chapter1.md must state the learning-node boundary");
  }
}

const codeGuidePath = join(bookDir, "code-guide.md");
if (existsSync(codeGuidePath)) {
  const codeGuide = readFileSync(codeGuidePath, "utf8");
  if (!codeGuide.includes("https://github.com/susumutomita/BlockChain")) {
    errors.push("code-guide.md must link to the canonical code repository");
  }
  if (!codeGuide.includes("scripts/rebuild-book-code.sh")) {
    errors.push("code-guide.md must document the chapter reconstruction gate");
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Zig blockchain English validation passed: ${chapterSlugs.length}/${canonicalChapterOrder.length} chapters in canonical order.`,
);
