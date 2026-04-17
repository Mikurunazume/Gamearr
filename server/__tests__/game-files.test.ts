import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemStorage } from "../storage.js";

// Avoid loading the real DB during these in-memory tests
vi.mock("../db.js", () => ({ db: {} }));

describe("MemStorage — game_files CRUD", () => {
  let storage: MemStorage;
  const gameId = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    storage = new MemStorage();
  });

  it("addGameFile creates a row with defaults and addedAt", async () => {
    const file = await storage.addGameFile({
      gameId,
      rootFolderId: null,
      relativePath: "The Witcher 3/setup.exe",
      sizeBytes: 42_000_000_000,
      fileType: "installer",
      checksumSha1: null,
    });
    expect(file.id).toBeDefined();
    expect(file.fileType).toBe("installer");
    expect(file.addedAt).toBeInstanceOf(Date);
    expect(file.lastSeenAt).toBeInstanceOf(Date);
  });

  it("getGameFiles returns all files for a given gameId sorted by relativePath", async () => {
    await storage.addGameFile({
      gameId,
      rootFolderId: null,
      relativePath: "B-file.iso",
      sizeBytes: 1,
      fileType: "iso",
      checksumSha1: null,
    });
    await storage.addGameFile({
      gameId,
      rootFolderId: null,
      relativePath: "A-file.iso",
      sizeBytes: 1,
      fileType: "iso",
      checksumSha1: null,
    });
    const files = await storage.getGameFiles(gameId);
    expect(files.map((f) => f.relativePath)).toEqual(["A-file.iso", "B-file.iso"]);
  });

  it("touchGameFile refreshes lastSeenAt", async () => {
    const file = await storage.addGameFile({
      gameId,
      rootFolderId: null,
      relativePath: "x.iso",
      sizeBytes: 1,
      fileType: "iso",
      checksumSha1: null,
    });
    const before = file.lastSeenAt!;
    await new Promise((r) => setTimeout(r, 5));
    const touched = await storage.touchGameFile(file.id);
    expect(touched).toBeDefined();
    expect(touched!.lastSeenAt!.getTime()).toBeGreaterThan(before.getTime());
  });

  it("removeGameFile deletes the row and getGameFile returns undefined after", async () => {
    const file = await storage.addGameFile({
      gameId,
      rootFolderId: null,
      relativePath: "doomed.iso",
      sizeBytes: 1,
      fileType: "iso",
      checksumSha1: null,
    });
    const removed = await storage.removeGameFile(file.id);
    expect(removed).toBe(true);
    expect(await storage.getGameFile(file.id)).toBeUndefined();
  });

  it("updateGameFile applies partial updates", async () => {
    const file = await storage.addGameFile({
      gameId,
      rootFolderId: null,
      relativePath: "thing.exe",
      sizeBytes: 1,
      fileType: "other",
      checksumSha1: null,
    });
    const updated = await storage.updateGameFile(file.id, {
      fileType: "installer",
      checksumSha1: "abc123",
    });
    expect(updated?.fileType).toBe("installer");
    expect(updated?.checksumSha1).toBe("abc123");
    // Unmodified fields remain
    expect(updated?.relativePath).toBe("thing.exe");
  });
});
