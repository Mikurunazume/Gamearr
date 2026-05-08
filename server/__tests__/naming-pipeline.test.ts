import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildGameContext, renderGameFolderName, planImport } from "../import-pipeline.js";
import type { Game, RootFolder } from "../../shared/schema.js";

// vi.mock calls are hoisted by Vitest above all imports at runtime
vi.mock("../db.js", () => ({ db: {} }));
vi.mock("../storage.js", () => ({ storage: {} }));
vi.mock("../downloaders.js", () => ({ DownloaderManager: {} }));
vi.mock("../library-scanner.js", () => ({ classifyFile: vi.fn(() => "game") }));
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

// ---------- planImport ----------

const BASE_ROOT_FOLDER: RootFolder = {
  id: "rf1",
  userId: "u1",
  path: "/library",
  label: null,
  enabled: true,
  accessible: true,
  diskTotalBytes: null,
  diskFreeBytes: null,
};

describe("planImport", () => {
  let sourceDir: string;

  beforeEach(async () => {
    sourceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gamearr-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(sourceDir, { recursive: true, force: true });
  });

  it("falls back to cleanReleaseName when folder template renders empty", async () => {
    // {Edition} always resolves to empty string for this game
    await fs.promises.writeFile(path.join(sourceDir, "game.iso"), "data");

    const plan = await planImport(sourceDir, BASE_GAME, BASE_ROOT_FOLDER, {
      folderTemplate: "{Edition}",
      downloadTitle: "Elden.Ring-CODEX",
    });

    expect(plan.targetDirRelative).toBeTruthy();
    expect(plan.targetDirRelative).not.toBe("");
    // cleanReleaseName("Elden.Ring-CODEX") → "Elden Ring"
    expect(plan.targetDirRelative).toBe("Elden Ring");
  });

  it("falls back to ctx.title when folder template renders empty and no downloadTitle", async () => {
    await fs.promises.writeFile(path.join(sourceDir, "game.iso"), "data");

    const plan = await planImport(sourceDir, BASE_GAME, BASE_ROOT_FOLDER, {
      folderTemplate: "{Edition}",
    });

    expect(plan.targetDirRelative).toBe("Elden Ring");
  });

  it("preserves original filenames for multi-file releases", async () => {
    await fs.promises.writeFile(path.join(sourceDir, "file1.bin"), "a");
    await fs.promises.writeFile(path.join(sourceDir, "file2.bin"), "b");

    const plan = await planImport(sourceDir, BASE_GAME, BASE_ROOT_FOLDER, {
      fileTemplate: "{Title} ({Year})",
    });

    const basenames = plan.files.map((f) => path.basename(f.targetRelative));
    expect(basenames).toContain("file1.bin");
    expect(basenames).toContain("file2.bin");
  });

  it("renames single file using the file template", async () => {
    await fs.promises.writeFile(path.join(sourceDir, "game.iso"), "data");

    const plan = await planImport(sourceDir, BASE_GAME, BASE_ROOT_FOLDER, {
      fileTemplate: "{Title} ({Year})",
    });

    expect(plan.files).toHaveLength(1);
    expect(path.basename(plan.files[0].targetRelative)).toBe("Elden Ring (2022).iso");
  });
});
