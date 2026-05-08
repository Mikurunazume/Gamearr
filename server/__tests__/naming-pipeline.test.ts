import { describe, it, expect, vi } from "vitest";
import { buildGameContext, renderGameFolderName } from "../import-pipeline.js";
import type { Game } from "../../shared/schema.js";

// vi.mock calls are hoisted by Vitest above all imports at runtime
vi.mock("../db.js", () => ({ db: {} }));
vi.mock("../storage.js", () => ({ storage: {} }));
vi.mock("../downloaders.js", () => ({ DownloaderManager: {} }));
vi.mock("../library-scanner.js", () => ({ classifyFile: vi.fn() }));
vi.mock("../logger.js", () => ({
  igdbLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  routesLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const BASE_GAME: Game = {
  id: "g1",
  userId: "u1",
  igdbId: 1,
  title: "Elden Ring",
  summary: null,
  coverUrl: null,
  releaseDate: "2022-02-25",
  rating: null,
  platforms: [],
  genres: [],
  publishers: [],
  developers: [],
  screenshots: [],
  status: "wanted",
  originalReleaseDate: null,
  releaseStatus: "released",
  hidden: false,
  addedAt: new Date(),
  completedAt: null,
};

describe("buildGameContext", () => {
  it("builds context from game with releaseDate", () => {
    const ctx = buildGameContext(BASE_GAME);
    expect(ctx.title).toBe("Elden Ring");
    expect(ctx.year).toBe(2022);
    expect(ctx.group).toBeUndefined();
  });

  it("extracts group from downloadTitle", () => {
    const ctx = buildGameContext(BASE_GAME, "Elden.Ring-CODEX");
    expect(ctx.group).toBe("CODEX");
  });

  it("year is null when releaseDate is absent", () => {
    const ctx = buildGameContext({ ...BASE_GAME, releaseDate: null });
    expect(ctx.year).toBeNull();
  });

  it("title falls back to Unknown when game.title is empty", () => {
    const ctx = buildGameContext({ ...BASE_GAME, title: "" });
    expect(ctx.title).toBe("Unknown");
  });
});

describe("renderGameFolderName", () => {
  it("renders folder name using template", () => {
    expect(renderGameFolderName(BASE_GAME, "{Title} ({Year})")).toBe("Elden Ring (2022)");
  });

  it("uses downloadTitle to populate group", () => {
    expect(renderGameFolderName(BASE_GAME, "{Title} [{Group}]", "Elden.Ring-CODEX")).toBe(
      "Elden Ring [CODEX]"
    );
  });

  it("omits year bracket when year is null", () => {
    expect(renderGameFolderName({ ...BASE_GAME, releaseDate: null }, "{Title} ({Year})")).toBe(
      "Elden Ring"
    );
  });
});
