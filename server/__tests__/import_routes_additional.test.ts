import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { mockStorage, mockImportManager, mockPlatformMappingService } = vi.hoisted(() => ({
  mockStorage: {
    getImportConfig: vi.fn(),
    getEnabledDownloaders: vi.fn(),
    getPendingImportReviews: vi.fn(),
    getGame: vi.fn(),
    getPlatformMappings: vi.fn(),
    getPathMappings: vi.fn(),
    removePathMapping: vi.fn(),
    getUserSettings: vi.fn(),
    updateUserSettings: vi.fn(),
    getRomMConfig: vi.fn(),
  },
  mockImportManager: {
    confirmImport: vi.fn(),
  },
  mockPlatformMappingService: {
    initializeDefaults: vi.fn(),
  },
}));

vi.mock("../storage.js", () => ({
  storage: mockStorage,
}));

vi.mock("../services/index.js", () => ({
  importManager: mockImportManager,
  platformMappingService: mockPlatformMappingService,
}));

import { importRouter } from "../routes/import.js";
import {
  makeImportConfig,
  makeRommConfig,
  createImportTestApp,
} from "./helpers/import-test-helpers.js";

describe("importRouter additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getEnabledDownloaders.mockResolvedValue([]);
    mockStorage.getImportConfig.mockResolvedValue(makeImportConfig({ overwriteExisting: true }));
    mockStorage.getRomMConfig.mockResolvedValue(
      makeRommConfig({ enabled: false, moveMode: "hardlink" })
    );
    mockStorage.getPathMappings.mockResolvedValue([]);
  });

  const createApp = (withUser = true) => createImportTestApp(importRouter, withUser);

  it("returns unauthorized for GET /config without user", async () => {
    const app = createApp(false);
    const response = await request(app).get("/api/imports/config");

    expect(response.status).toBe(401);
  });

  it("returns pending manual-review imports with game title fallback", async () => {
    mockStorage.getPendingImportReviews.mockResolvedValue([
      {
        id: "d1",
        gameId: "g1",
        downloadTitle: "Download 1",
        status: "manual_review_required",
        downloaderId: "down-1",
        addedAt: "2026-01-01",
      },
    ]);
    mockStorage.getGame.mockResolvedValueOnce({ title: "Known Game" });

    const app = createApp();
    const response = await request(app).get("/api/imports/pending");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: "d1",
        gameTitle: "Known Game",
        status: "manual_review_required",
      }),
    ]);
  });

  it("initializes platform mappings via /mappings/platforms/init", async () => {
    mockStorage.getPlatformMappings.mockResolvedValue([
      { id: "m1", igdbPlatformId: 19, rommPlatformName: "snes" },
    ]);
    const app = createApp();

    const response = await request(app).post("/api/imports/mappings/platforms/init").send({});

    expect(response.status).toBe(200);
    expect(mockPlatformMappingService.initializeDefaults).toHaveBeenCalled();
    expect(response.body.count).toBe(1);
  });

  it("returns 400 for invalid /config patch payload", async () => {
    const app = createApp();

    const response = await request(app).patch("/api/imports/config").send({
      invalidField: true,
    });

    expect(response.status).toBe(400);
  });

  it("returns neutral hardlink check when no downloader paths are configured", async () => {
    const app = createApp();

    const response = await request(app).get("/api/imports/hardlink/check");

    expect(response.status).toBe(200);
    expect(response.body.generic.supportedForAll).toBeNull();
    expect(response.body.romm.supportedForAll).toBeNull();
  });

  it("updates import config using authenticated userId", async () => {
    mockStorage.getUserSettings.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      rommEnabled: false,
    });
    mockStorage.updateUserSettings.mockResolvedValue({ id: "settings-1", userId: "user-1" });

    const app = createApp();
    const response = await request(app).patch("/api/imports/config").send({
      renamePattern: "{Title} - {Platform}",
    });

    expect(response.status).toBe(200);
    expect(mockStorage.updateUserSettings).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ renamePattern: "{Title} - {Platform}" })
    );
  });

  it("updates romm config using authenticated userId", async () => {
    mockStorage.getUserSettings.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      rommEnabled: false,
    });
    mockStorage.updateUserSettings.mockResolvedValue({ id: "settings-1", userId: "user-1" });

    const app = createApp();
    const response = await request(app).patch("/api/imports/romm").send({
      enabled: true,
      libraryRoot: "/data/romm",
    });

    expect(response.status).toBe(200);
    expect(mockStorage.updateUserSettings).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        rommEnabled: true,
        rommLibraryRoot: "/data/romm",
      })
    );
  });
});
