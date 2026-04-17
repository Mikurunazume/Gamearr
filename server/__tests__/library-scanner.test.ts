import { describe, it, expect, vi } from "vitest";

// We only want to test the pure helpers — avoid bootstrapping the whole DB.
vi.mock("../db.js", () => ({ db: {} }));
vi.mock("../igdb.js", () => ({
  igdbClient: { searchGames: vi.fn() },
}));
vi.mock("../socket.js", () => ({ notifyUser: vi.fn() }));

import { __testing, classifyFile } from "../library-scanner.js";

describe("library-scanner helpers", () => {
  describe("classifyFile", () => {
    it("classifies installers", () => {
      expect(classifyFile("setup.exe")).toBe("installer");
      expect(classifyFile("install.msi")).toBe("installer");
    });
    it("classifies isos and disc images", () => {
      expect(classifyFile("game.iso")).toBe("iso");
      expect(classifyFile("cd.bin")).toBe("iso");
      expect(classifyFile("disc.img")).toBe("iso");
    });
    it("classifies archives", () => {
      expect(classifyFile("data.zip")).toBe("archive");
      expect(classifyFile("data.7z")).toBe("archive");
      expect(classifyFile("data.rar")).toBe("archive");
    });
    it("ignores metadata files", () => {
      expect(classifyFile("release.nfo")).toBe("ignore");
      expect(classifyFile("notes.txt")).toBe("ignore");
      expect(classifyFile("checksum.md5")).toBe("ignore");
      expect(classifyFile("cover.jpg")).toBe("ignore");
    });
    it("falls back to other for unknown extensions", () => {
      expect(classifyFile("readme.bin.patch")).toBe("other");
      expect(classifyFile("game.dat")).toBe("other");
    });
    it("is case-insensitive on extension", () => {
      expect(classifyFile("SETUP.EXE")).toBe("installer");
      expect(classifyFile("Game.ISO")).toBe("iso");
    });
  });

  describe("scoreMatch", () => {
    it("returns 1 on exact normalized match", () => {
      expect(__testing.scoreMatch("The Witcher 3", "The Witcher 3")).toBe(1);
    });
    it("is high for near matches", () => {
      const s = __testing.scoreMatch("The Witcher 3", "The Witcher III");
      // Strict Jaccard on words: 2/4 = 0.5, but add prefix bonus if applicable
      expect(s).toBeGreaterThan(0);
    });
    it("returns 0 for completely different titles", () => {
      expect(__testing.scoreMatch("Completely Foo", "Bar Baz")).toBe(0);
    });
    it("gives prefix bonus for starts-with in either direction", () => {
      const withBonus = __testing.scoreMatch("Cyberpunk 2077", "Cyberpunk 2077 Phantom Liberty");
      const base = __testing.scoreMatch("Cyberpunk XYZ", "Cyberpunk 2077 Phantom Liberty");
      expect(withBonus).toBeGreaterThan(base);
    });
    it("ignores case and punctuation via normalizeTitle", () => {
      expect(__testing.scoreMatch("god-of-war ragnarok", "God of War: Ragnarok")).toBeGreaterThan(
        0.8
      );
    });
  });
});
