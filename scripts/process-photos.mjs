import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "photo-src");
const outputRoot = path.join(projectRoot, "public", "photos");

export const categories = ["luka", "vanja"];
const supportedExtensions = new Set([".heic", ".heif", ".jpg", ".jpeg", ".png"]);
const heicExtensions = new Set([".heic", ".heif"]);

export async function processPhoto(inputPath, category) {
  const extension = path.extname(inputPath).toLowerCase();
  if (!categories.includes(category) || !supportedExtensions.has(extension)) {
    return null;
  }

  const [contents, stats] = await Promise.all([
    fs.readFile(inputPath),
    fs.stat(inputPath),
  ]);
  const hash = crypto.createHash("sha256").update(contents).digest("hex").slice(0, 10);
  const createdAt = validDate(stats.birthtime) ? stats.birthtime : new Date();
  const date = localDate(createdAt);
  const time = localTime(createdAt);
  const originalStem = path.basename(inputPath, path.extname(inputPath));
  const stem = `${time}-${slugify(originalStem)}-${hash}`;
  const outputExtension = heicExtensions.has(extension) ? ".jpg" : extension;
  const outputDirectory = path.join(outputRoot, category, date);
  const outputPath = path.join(outputDirectory, `${stem}${outputExtension}`);
  const thumbnailPath = path.join(outputDirectory, `${stem}.thumb${outputExtension}`);

  await fs.mkdir(outputDirectory, { recursive: true });

  if (!(await exists(outputPath))) {
    if (heicExtensions.has(extension)) {
      await convertHeic(inputPath, outputPath);
    } else {
      await copyAtomically(inputPath, outputPath);
    }
  }

  if (!(await exists(thumbnailPath))) {
    await makeThumbnail(outputPath, thumbnailPath, outputExtension);
  }

  return {
    category,
    date,
    outputPath,
    thumbnailPath,
    relativeOutputPath: path.relative(projectRoot, outputPath),
  };
}

export async function processAllPhotos() {
  const processed = [];

  for (const category of categories) {
    const directory = path.join(sourceRoot, category);
    await fs.mkdir(directory, { recursive: true });

    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith(".")) {
        continue;
      }

      const result = await processPhoto(path.join(directory, entry.name), category);
      if (result) {
        processed.push(result);
        console.log(`Processed ${category}/${entry.name} -> ${result.relativeOutputPath}`);
      }
    }
  }

  return processed;
}

async function convertHeic(inputPath, outputPath) {
  const temporaryPath = `${outputPath}.tmp.jpg`;
  try {
    await run("/usr/bin/sips", [
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "85",
      inputPath,
      "--out",
      temporaryPath,
    ]);
    await replaceFile(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function makeThumbnail(inputPath, thumbnailPath, extension) {
  const temporaryPath = `${thumbnailPath}.tmp${extension}`;
  try {
    await run("/usr/bin/sips", ["-Z", "360", inputPath, "--out", temporaryPath]);
    await replaceFile(temporaryPath, thumbnailPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function copyAtomically(inputPath, outputPath) {
  const temporaryPath = `${outputPath}.tmp`;
  try {
    await fs.copyFile(inputPath, temporaryPath);
    await replaceFile(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function replaceFile(source, destination) {
  await fs.rm(destination, { force: true });
  await fs.rename(source, destination);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function validDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getTime() > 0;
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}${minutes}${seconds}`;
}

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "photo";
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(command)} failed: ${stderr.trim()}`));
      }
    });
  });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  processAllPhotos().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
