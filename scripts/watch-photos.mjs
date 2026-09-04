import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";
import { categories, processPhoto } from "./process-photos.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "photo-src");
const autoPublish = process.env.PHOTO_AUTO_PUBLISH !== "0";
const watchedDirectories = categories.map((category) => path.join(sourceRoot, category));
const changedGroups = new Set();
let processing = Promise.resolve();
let publishTimer;
let publishing = Promise.resolve();

console.log(`Watching ${watchedDirectories.join(" and ")}`);
console.log(autoPublish ? "Auto-commit and push are enabled." : "Auto-publish is disabled.");

const watcher = chokidar.watch(watchedDirectories, {
  persistent: true,
  ignoreInitial: false,
  depth: 0,
  ignored: (watchedPath, stats) => Boolean(stats?.isFile() && path.basename(watchedPath).startsWith(".")),
  awaitWriteFinish: {
    stabilityThreshold: 1500,
    pollInterval: 200,
  },
});

watcher.on("add", (inputPath) => {
  const category = path.basename(path.dirname(inputPath));

  processing = processing
    .then(async () => {
      const result = await processPhoto(inputPath, category);
      if (!result) {
        console.log(`Ignored unsupported file: ${path.basename(inputPath)}`);
        return;
      }

      console.log(`Ready: ${result.relativeOutputPath}`);
      changedGroups.add(`${result.category}/${result.date}`);
      schedulePublish();
    })
    .catch((error) => {
      console.error(`Could not process ${inputPath}:`, error);
    });
});

watcher.on("error", (error) => {
  console.error("Watcher error:", error);
});

function schedulePublish() {
  if (!autoPublish) {
    return;
  }

  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => {
    publishing = publishing.then(publishChanges).catch((error) => {
      console.error("Could not publish photos:", error.message);
    });
  }, 5000);
}

async function publishChanges() {
  await processing;
  await runGit(["rev-parse", "--is-inside-work-tree"]);
  await runGit(["add", "--", "public/photos"]);

  const hasChanges = (await gitExitCode(["diff", "--cached", "--quiet", "--", "public/photos"])) === 1;

  if (hasChanges) {
    const groups = [...changedGroups].sort();
    const message = commitMessage(groups);
    await runGit(["commit", "--only", "-m", message, "--", "public/photos"]);
    console.log(`Committed: ${message}`);
  }

  changedGroups.clear();
  await runGit(["push"]);
  console.log("Pushed. GitHub Pages will rebuild the site.");
}

function commitMessage(groups) {
  if (groups.length === 1) {
    const [category, date] = groups[0].split("/");
    return `chore(photos): add ${category} photos for ${date}`;
  }

  return "chore(photos): publish new photos";
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `git exited with ${code}`));
      }
    });
  });
}

function gitExitCode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: projectRoot, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", resolve);
  });
}

async function shutDown() {
  clearTimeout(publishTimer);
  await processing;
  await publishing;
  await watcher.close();
  process.exit(0);
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
