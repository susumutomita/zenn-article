import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const bookDir = resolve("books/cloud-competition-en");
const configPath = join(bookDir, "config.yaml");
const errors = [];

if (!existsSync(configPath)) {
  throw new Error(`Missing English book config: ${configPath}`);
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

if (!config.includes('title: "Build Your Own Cloud Competition"')) {
  errors.push("config.yaml must use the English title");
}
if (!config.includes("published: false")) {
  errors.push("the Zenn English edition must remain unpublished");
}
if (chapterSlugs.length !== 27) {
  errors.push(`expected 27 chapters, found ${chapterSlugs.length}`);
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
  if (/[ぁ-んァ-ヶ一-龠]/.test(markdown)) {
    errors.push(`${file}: contains Japanese text`);
  }
  if (markdown.includes("**")) {
    errors.push(`${file}: contains prohibited bold syntax`);
  }
  if (/textlint-(?:disable|enable)/.test(markdown)) {
    errors.push(`${file}: contains a textlint suppression comment`);
  }
  if (/Cloud Rescue|feat\/cloud-rescue-book|book\/cloud-competition-draft/.test(markdown)) {
    errors.push(`${file}: contains stale draft material`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `English book validation passed: ${chapterSlugs.length} chapters, no Japanese text, bold syntax, suppressions, or stale draft references.`,
);
