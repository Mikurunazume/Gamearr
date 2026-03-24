import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { mockStorage, mockImportManager } = vi.hoisted(() => ({
  mockStorage: {
    getImportConfig: vi.fn(),
    getRomMConfig: vi.fn(),
  },
  mockImportManager: {
    confirmImport: vi.fn(),
  },
}));

vi.mock("../storage.js", () => ({
  storage: mockStorage,
}));

vi.mock("../services/index.js", () => ({
  importManager: mockImportManager,
  platformMappingService: {
    initializeDefaults: vi.fn(),
  },
}));

import { importRouter } from "../routes/import.js";
import {
  makeImportConfig,
  makeRommConfig,
  createImportTestApp,
} from "./helpers/import-test-helpers.js";

describe("importRouter confirmImport security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getImportConfig.mockResolvedValue(
      makeImportConfig({ renamePattern: "{Title} ({Region})" })
    );
    mockStorage.getRomMConfig.mockResolvedValue(makeRommConfig({ moveMode: "hardlink" }));
  });

  const createApp = () => createImportTestApp(importRouter);

  it("rejects path traversal in proposedPath", async () => {
    const app = createApp();

    const response = await request(app).post("/api/imports/dl-1/confirm").send({
      strategy: "pc",
      proposedPath: "../../etc/passwd",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid proposed path");
    expect(mockImportManager.confirmImport).not.toHaveBeenCalled();
  });

  it("accepts in-root absolute path", async () => {
    const app = createApp();

    const response = await request(app).post("/api/imports/dl-2/confirm").send({
      strategy: "romm",
      proposedPath: "/data/romm/roms/game.rom",
      transferMode: "hardlink",
    });

    expect(response.status).toBe(200);
    expect(mockImportManager.confirmImport).toHaveBeenCalledWith(
      "dl-2",
      expect.objectContaining({
        strategy: "romm",
        proposedPath: expect.stringMatching(/roms[\\/]game\.rom$/),
      }),
      "user-1"
    );
  });
});
