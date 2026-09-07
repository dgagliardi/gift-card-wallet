import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSourceSha } from "./source-version";

describe("candidate source receipt", () => {
  it("accepts only an exact full Git SHA", () => {
    const root = mkdtempSync(path.join(tmpdir(), "giftcard-source-"));
    const sha = "0123456789abcdef0123456789abcdef01234567";
    writeFileSync(path.join(root, ".source-sha"), `${sha}\n`);
    expect(readSourceSha(root)).toBe(sha);
    writeFileSync(path.join(root, ".source-sha"), "not-a-sha\n");
    expect(readSourceSha(root)).toBeNull();
  });
});
