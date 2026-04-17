import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { probeRootFolder } from "../root-folders.js";

describe("probeRootFolder", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gamearr-rf-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns accessible=true for a writable directory", async () => {
    const health = await probeRootFolder(tmpDir);
    expect(health.accessible).toBe(true);
    expect(health.error).toBeUndefined();
  });

  it("returns accessible=false for a non-existent path", async () => {
    const health = await probeRootFolder(path.join(tmpDir, "does-not-exist"));
    expect(health.accessible).toBe(false);
    expect(health.error).toBeDefined();
  });

  it("returns accessible=false when the path points to a file, not a directory", async () => {
    const filePath = path.join(tmpDir, "plain-file.txt");
    await fs.promises.writeFile(filePath, "hello");
    const health = await probeRootFolder(filePath);
    expect(health.accessible).toBe(false);
    expect(health.error).toMatch(/not a directory/i);
  });

  it("exposes disk stats when the platform supports fs.statfs (Node 18.15+)", async () => {
    const health = await probeRootFolder(tmpDir);
    // Disk stats are best-effort: either both defined and > 0, or both null
    if (health.diskTotalBytes !== null) {
      expect(health.diskTotalBytes).toBeGreaterThan(0);
      expect(health.diskFreeBytes).toBeGreaterThanOrEqual(0);
      expect(health.diskFreeBytes!).toBeLessThanOrEqual(health.diskTotalBytes);
    } else {
      expect(health.diskFreeBytes).toBeNull();
    }
  });
});
