import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const label = "com.iodicdesign.ipad-domaci";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logsDirectory = path.join(projectRoot, ".logs");
const agentsDirectory = path.join(os.homedir(), "Library", "LaunchAgents");
const plistPath = path.join(agentsDirectory, `${label}.plist`);
const domain = `gui/${process.getuid()}`;

await fs.mkdir(logsDirectory, { recursive: true });
await fs.mkdir(agentsDirectory, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(path.join(projectRoot, "scripts", "watch-photos.mjs"))}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(projectRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logsDirectory, "watcher.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logsDirectory, "watcher-error.log"))}</string>
</dict>
</plist>
`;

await fs.writeFile(plistPath, plist);
spawnSync("launchctl", ["bootout", domain, plistPath], { stdio: "ignore" });
const result = spawnSync("launchctl", ["bootstrap", domain, plistPath], {
  encoding: "utf8",
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "Could not install watcher.");
  process.exit(1);
}

console.log(`Installed and started ${label}`);
console.log(`Logs: ${logsDirectory}`);

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
