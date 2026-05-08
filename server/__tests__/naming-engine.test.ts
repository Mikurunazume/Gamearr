import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  sanitizeFilename,
  previewAll,
  DEFAULT_FOLDER_TEMPLATE,
  DEFAULT_FILE_TEMPLATE,
  type GameContext,
} from "../../shared/naming-engine.js";

const ELDEN_RING: GameContext = {
  title: "Elden Ring",
  year: 2022,
  platform: "PC",
  version: "v1.0.2",
  group: "CODEX",
  source: "GOG",
};

describe("renderTemplate", () => {
  it("substitutes all defined variables", () => {
    expect(renderTemplate("{Title} ({Year}) [{Group}]", ELDEN_RING)).toBe(
      "Elden Ring (2022) [CODEX]"
    );
  });

  it("removes empty [] when group is absent", () => {
    const ctx: GameContext = { title: "Elden Ring", year: 2022 };
    expect(renderTemplate("{Title} ({Year}) [{Group}]", ctx)).toBe("Elden Ring (2022)");
  });

  it("removes empty () when year is null", () => {
    const ctx: GameContext = { title: "Elden Ring", year: null };
    expect(renderTemplate("{Title} ({Year})", ctx)).toBe("Elden Ring");
  });

  it("TitleThe moves leading 'The' to the end", () => {
    const ctx: GameContext = { title: "The Witcher 3", year: 2015 };
    expect(renderTemplate("{TitleThe} ({Year})", ctx)).toBe("Witcher 3, The (2015)");
  });

  it("TitleThe is unchanged when title has no leading 'The'", () => {
    expect(renderTemplate("{TitleThe}", ELDEN_RING)).toBe("Elden Ring");
  });

  it("handles unicode titles without corruption", () => {
    const ctx: GameContext = { title: "サイバーパンク 2077", year: 2020 };
    expect(renderTemplate("{Title} ({Year})", ctx)).toBe("サイバーパンク 2077 (2020)");
  });

  it("collapses multiple spaces when several variables are empty", () => {
    const ctx: GameContext = { title: "Game", year: null };
    expect(renderTemplate("{Title} {Platform} ({Year})", ctx)).toBe("Game");
  });

  it("keeps unknown tokens verbatim", () => {
    expect(renderTemplate("{Title} {Unknown}", ELDEN_RING)).toBe("Elden Ring {Unknown}");
  });

  it("Edition and Quality always resolve to empty (deferred)", () => {
    expect(renderTemplate("{Title} [{Edition}] [{Quality}]", ELDEN_RING)).toBe("Elden Ring");
  });

  it("DEFAULT_FOLDER_TEMPLATE renders correctly", () => {
    expect(renderTemplate(DEFAULT_FOLDER_TEMPLATE, ELDEN_RING)).toBe("Elden Ring (2022)");
  });

  it("DEFAULT_FILE_TEMPLATE renders correctly", () => {
    expect(renderTemplate(DEFAULT_FILE_TEMPLATE, ELDEN_RING)).toBe("Elden Ring (2022) [CODEX]");
  });
});

describe("sanitizeFilename — windows", () => {
  it("strips Windows-illegal characters", () => {
    expect(sanitizeFilename('Game: A "Subtitle" <test> | x', "windows")).toBe(
      "Game A Subtitle test  x"
    );
  });

  it("strips trailing dot and space", () => {
    expect(sanitizeFilename("Game name.  ", "windows")).toBe("Game name");
  });

  it("strips C0 control characters", () => {
    expect(sanitizeFilename("Game\x00Name\x1f", "windows")).toBe("GameName");
  });

  it("truncates to 200 characters", () => {
    expect(sanitizeFilename("A".repeat(300), "windows").length).toBe(200);
  });
});

describe("sanitizeFilename — posix", () => {
  it("strips only forward slash and null byte", () => {
    expect(sanitizeFilename("Game: A/B\x00C", "posix")).toBe("Game: ABC");
  });

  it("preserves colons and other special chars on posix", () => {
    expect(sanitizeFilename('Game: "Part 2"', "posix")).toBe('Game: "Part 2"');
  });
});

describe("previewAll", () => {
  it("returns one rendered output per sample", () => {
    const results = previewAll("{Title} ({Year})", [
      ELDEN_RING,
      { title: "Hades", year: 2020, group: "FLT" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].output).toBe("Elden Ring (2022)");
    expect(results[1].output).toBe("Hades (2020)");
  });

  it("input reference is preserved in result", () => {
    const results = previewAll("{Title}", [ELDEN_RING]);
    expect(results[0].input).toBe(ELDEN_RING);
  });

  it("applies windows sanitization to outputs", () => {
    const results = previewAll("{Title}", [{ title: "Game: Part 2", year: null }]);
    expect(results[0].output).toBe("Game Part 2");
  });
});
