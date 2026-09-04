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
const jpegExtensions = new Set([".jpg", ".jpeg"]);

const thumbnailSize = 360;
const jpegQuality = 88;
const thumbnailQuality = 82;
const enhanceEnabled = process.env.PHOTO_ENHANCE !== "0";
const forceReprocess = process.env.PHOTO_FORCE === "1" || process.argv.includes("--force");

// Levels/contrast pass tuned for phone photos of homework on paper: stretch the
// histogram so paper reaches white and pencil reaches black, add an S-curve for
// local contrast, then sharpen so faint pencil strokes stay legible. The stretch
// runs across the channels together, not per channel, because per-channel levels
// swing the paper towards whatever cast the room lighting had. Saturation is left
// alone for the same reason.
const enhanceArguments = [
  "-contrast-stretch", "0.5%x0.5%",
  "-sigmoidal-contrast", "3x50%",
  "-unsharp", "0x1.5+1.0+0.02",
];

const magickCandidates = ["/opt/homebrew/bin/magick", "/usr/local/bin/magick", "/opt/homebrew/bin/convert", "/usr/local/bin/convert"];
let magickPathPromise;

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

  if (forceReprocess || !(await exists(outputPath))) {
    await render(inputPath, outputPath, outputExtension, {
      quality: jpegQuality,
      isHeic: heicExtensions.has(extension),
    });
  }

  if (forceReprocess || !(await exists(thumbnailPath))) {
    await render(inputPath, thumbnailPath, outputExtension, {
      quality: thumbnailQuality,
      isHeic: heicExtensions.has(extension),
      maxSize: thumbnailSize,
    });
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

// Always renders from the original so the enhancement runs once per output and
// the thumbnail is sharpened at its own scale instead of inheriting full-size
// sharpening. Falls back to sips when ImageMagick is not installed, which keeps
// the old behaviour minus the levels pass.
async function render(inputPath, outputPath, extension, { quality, isHeic, maxSize } = {}) {
  const temporaryPath = `${outputPath}.tmp${extension}`;
  const magick = await resolveMagick();

  try {
    if (magick) {
      const args = [inputPath, "-auto-orient"];

      if (maxSize) {
        args.push("-resize", `${maxSize}x${maxSize}>`);
      }
      if (enhanceEnabled) {
        args.push(...enhanceArguments);
      }
      if (jpegExtensions.has(extension)) {
        args.push("-quality", String(quality), "-interlace", "Plane");
      }

      await run(magick, [...args, temporaryPath]);
    } else {
      await renderWithSips(inputPath, temporaryPath, { isHeic, maxSize });
    }

    await replaceFile(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function renderWithSips(inputPath, outputPath, { isHeic, maxSize }) {
  const args = [];

  if (isHeic) {
    args.push("-s", "format", "jpeg", "-s", "formatOptions", "85");
  }
  if (maxSize) {
    args.push("-Z", String(maxSize));
  }
  if (args.length === 0) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  await run("/usr/bin/sips", [...args, inputPath, "--out", outputPath]);
}

async function resolveMagick() {
  magickPathPromise ??= (async () => {
    for (const candidate of magickCandidates) {
      if (await exists(candidate)) {
        return candidate;
      }
    }

    console.warn("ImageMagick not found; skipping the levels/contrast pass.");
    return null;
  })();

  return magickPathPromise;
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
