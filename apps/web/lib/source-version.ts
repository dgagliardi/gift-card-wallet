import { readFileSync } from "node:fs";
import path from "node:path";

export function readSourceSha(appRoot = process.cwd()): string | null {
  try {
    const value = readFileSync(path.join(appRoot, ".source-sha"), "utf8").trim();
    return /^[0-9a-f]{40}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}
