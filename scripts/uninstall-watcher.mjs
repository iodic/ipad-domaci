import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const label = "com.iodicdesign.ipad-domaci";
const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const domain = `gui/${process.getuid()}`;

spawnSync("launchctl", ["bootout", domain, plistPath], { stdio: "ignore" });
await fs.rm(plistPath, { force: true });
console.log(`Uninstalled ${label}`);
