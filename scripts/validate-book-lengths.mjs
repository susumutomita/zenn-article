import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const maxCharacters = 50_000;
const booksRoot = path.join(process.cwd(), "books");
const bookDirectories = (await readdir(booksRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(booksRoot, entry.name));

const results = [];
let failed = false;

for (const bookDirectory of bookDirectories) {
  const configPath = path.join(bookDirectory, "config.yaml");
  let config;

  try {
    config = await readFile(configPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }

  const chaptersSection = config.match(
    /^chapters:[ \t]*\r?\n((?:[ \t]+-[ \t]+[^\r\n]+\r?\n?)*)/m,
  );
  if (!chaptersSection) {
    console.error(`BOOK_LENGTH FAIL: chapters list is missing from ${path.relative(process.cwd(), configPath)}`);
    failed = true;
    continue;
  }

  const chapterSlugs = [
    ...chaptersSection[1].matchAll(
      /^[ \t]+-[ \t]+([a-zA-Z0-9_-]+)[ \t]*$/gm,
    ),
  ].map((match) => match[1]);

  for (const slug of chapterSlugs) {
    const chapterPath = path.join(bookDirectory, `${slug}.md`);
    let source;

    try {
      source = await readFile(chapterPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        console.error(`BOOK_LENGTH FAIL: configured chapter is missing: ${path.relative(process.cwd(), chapterPath)}`);
        failed = true;
        continue;
      }
      throw error;
    }

    const relativePath = path.relative(process.cwd(), chapterPath);
    const characters = source.length;
    results.push({ relativePath, characters });

    if (characters > maxCharacters) {
      console.error(`BOOK_LENGTH FAIL: ${relativePath} has ${characters} characters (maximum ${maxCharacters})`);
      failed = true;
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  const longest = results.sort((left, right) => right.characters - left.characters)[0];
  console.log(
    `BOOK_LENGTH PASS: ${results.length} configured chapters; longest is ${longest.relativePath} (${longest.characters}/${maxCharacters})`,
  );
}
