import { describe, it, expect } from "vitest";
import {
  parseGameVaultFilename,
  renderGameVaultFilename,
  sanitizeGameVaultFilename,
} from "../../shared/gamevault-naming.js";

describe("parseGameVaultFilename", () => {
  it("parses the canonical spec example", () => {
    const p = parseGameVaultFilename("Far Cry 6 (v1.5.0) (2021).zip");
    expect(p.title).toBe("Far Cry 6");
    expect(p.version).toBe("1.5.0");
    expect(p.releaseYear).toBe(2021);
    expect(p.extension).toBe("zip");
    expect(p.earlyAccess).toBe(false);
    expect(p.gameType).toBeNull();
    expect(p.noCache).toBe(false);
    expect(p.tags).toEqual([]);
  });

  it("parses title + year only", () => {
    const p = parseGameVaultFilename("Age of Empires IV (2021).iso");
    expect(p.title).toBe("Age of Empires IV");
    expect(p.releaseYear).toBe(2021);
    expect(p.version).toBeNull();
  });

  it("parses Build-style versions", () => {
    const p = parseGameVaultFilename("Big Ambitions (Build 20962582) (2024).7z");
    expect(p.title).toBe("Big Ambitions");
    expect(p.build).toBe("Build 20962582");
    expect(p.releaseYear).toBe(2024);
  });

  it("parses Early Access flag", () => {
    const p = parseGameVaultFilename("SomeGame (v0.2.0) (EA) (2023).zip");
    expect(p.earlyAccess).toBe(true);
    expect(p.version).toBe("0.2.0");
    expect(p.releaseYear).toBe(2023);
  });

  it("parses GameType override", () => {
    const p = parseGameVaultFilename("CoolGame (W_P) (2020).exe");
    expect(p.gameType).toBe("W_P");
    expect(p.extension).toBe("exe");
  });

  it("parses NoCache flag", () => {
    const p = parseGameVaultFilename("PrivateGame (NC) (2022).zip");
    expect(p.noCache).toBe(true);
  });

  it("preserves free-form square-bracket tags in order", () => {
    const p = parseGameVaultFilename("Alien Isolation (v1.0.4) [All DLCs] [GOG] (2014).7z");
    expect(p.title).toBe("Alien Isolation");
    expect(p.version).toBe("1.0.4");
    expect(p.releaseYear).toBe(2014);
    expect(p.tags).toEqual(["All DLCs", "GOG"]);
  });

  it("handles repack-style brackets", () => {
    const p = parseGameVaultFilename("Bully [DODI Repack] (2008).7z");
    expect(p.title).toBe("Bully");
    expect(p.tags).toEqual(["DODI Repack"]);
    expect(p.releaseYear).toBe(2008);
  });

  it("leaves legitimate parens in title intact when not structured", () => {
    const p = parseGameVaultFilename("S.T.A.L.K.E.R. (Shadow of Chernobyl) (2007).iso");
    // `(Shadow of Chernobyl)` is NOT a structured token so it stays in the title
    expect(p.title).toBe("S.T.A.L.K.E.R. (Shadow of Chernobyl)");
    expect(p.releaseYear).toBe(2007);
  });

  it("falls back gracefully on a bare filename", () => {
    const p = parseGameVaultFilename("OneWord.zip");
    expect(p.title).toBe("OneWord");
    expect(p.extension).toBe("zip");
    expect(p.releaseYear).toBeNull();
  });

  it("handles extensionless input", () => {
    const p = parseGameVaultFilename("Portable Game (v2.1) (2019)");
    expect(p.title).toBe("Portable Game");
    expect(p.version).toBe("2.1");
    expect(p.extension).toBeNull();
  });

  it("parses the stacked spec pattern end-to-end", () => {
    const p = parseGameVaultFilename("Noita (v1.0) (EA) (W_P) (NC) (2020) [Build 42].zip");
    // Square-bracket tag comes last — still captured
    expect(p.title).toBe("Noita");
    expect(p.version).toBe("1.0");
    expect(p.earlyAccess).toBe(true);
    expect(p.gameType).toBe("W_P");
    expect(p.noCache).toBe(true);
    expect(p.releaseYear).toBe(2020);
    expect(p.tags).toEqual(["Build 42"]);
  });
});

describe("renderGameVaultFilename", () => {
  it("renders the canonical spec format", () => {
    const out = renderGameVaultFilename({
      title: "Far Cry 6",
      version: "1.5.0",
      releaseYear: 2021,
      extension: "zip",
    });
    expect(out).toBe("Far Cry 6 (v1.5.0) (2021).zip");
  });

  it("round-trips through parse", () => {
    const input = "Alien Isolation (v1.0.4) (2014) [All DLCs] [GOG].7z";
    const parsed = parseGameVaultFilename(input);
    const rendered = renderGameVaultFilename(parsed);
    // Token ordering may differ (tags after year instead of before) but
    // re-parsing must yield an identical structure
    const reparsed = parseGameVaultFilename(rendered);
    expect(reparsed.title).toBe(parsed.title);
    expect(reparsed.version).toBe(parsed.version);
    expect(reparsed.releaseYear).toBe(parsed.releaseYear);
    expect(reparsed.tags.sort()).toEqual(parsed.tags.sort());
  });

  it("throws when title is missing", () => {
    expect(() => renderGameVaultFilename({ version: "1.0" })).toThrow();
  });
});

describe("sanitizeGameVaultFilename", () => {
  it("strips prohibited characters", () => {
    expect(sanitizeGameVaultFilename("Half-Life 2: Episode Two")).toBe("Half-Life 2 Episode Two");
    expect(sanitizeGameVaultFilename('A/B\\C|D?E*F"G<H>I')).toBe("ABCDEFGHI");
  });

  it("trims trailing spaces and dots", () => {
    expect(sanitizeGameVaultFilename("Game name...  ")).toBe("Game name");
  });

  it("prefixes reserved Windows names with an underscore", () => {
    expect(sanitizeGameVaultFilename("CON")).toBe("_CON");
    expect(sanitizeGameVaultFilename("COM1")).toBe("_COM1");
  });

  it("is idempotent on already-clean input", () => {
    const clean = "Far Cry 6 (v1.5.0) (2021)";
    expect(sanitizeGameVaultFilename(clean)).toBe(clean);
  });
});
