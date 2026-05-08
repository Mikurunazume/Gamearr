import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { registerRoutes } from "../routes.js";
import { storage } from "../storage.js";
import type { User, UserSettings } from "../../shared/schema.js";

const DEFAULT_SETTINGS: Partial<UserSettings> = {
  folderNamingTemplate: "{Title} ({Year})",
  fileNamingTemplate: "{Title} ({Year}) [{Group}]",
};

vi.mock("../storage.js", () => ({
  storage: {
    getUserSettings: vi.fn().mockResolvedValue({
      folderNamingTemplate: "{Title} ({Year})",
      fileNamingTemplate: "{Title} ({Year}) [{Group}]",
    }),
    updateUserSettings: vi.fn().mockImplementation((_id: string, updates: object) =>
      Promise.resolve({
        folderNamingTemplate: "{Title} ({Year})",
        fileNamingTemplate: "{Title} ({Year}) [{Group}]",
        ...updates,
      })
    ),
    createUserSettings: vi.fn().mockResolvedValue({
      folderNamingTemplate: "{Title} ({Year})",
      fileNamingTemplate: "{Title} ({Year}) [{Group}]",
    }),
    getUserGames: vi.fn().mockResolvedValue([]),
    searchUserGames: vi.fn().mockResolvedValue([]),
    addGame: vi.fn(),
    removeGame: vi.fn(),
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    countUsers: vi.fn().mockResolvedValue(1),
    registerSetupUser: vi.fn(),
    setSystemConfig: vi.fn(),
    getSystemConfig: vi.fn(),
    assignOrphanGamesToUser: vi.fn(),
    updateGameStatus: vi.fn(),
    updateGameHidden: vi.fn(),
    getRootFolders: vi.fn().mockResolvedValue([]),
    getEnabledRootFolders: vi.fn().mockResolvedValue([]),
    getIndexers: vi.fn().mockResolvedValue([]),
    getDownloaders: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return {
    ...actual,
    authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
      (req as Request).user = { id: "user-1", username: "testuser" } as unknown as User;
      next();
    },
  };
});

vi.mock("../db.js", () => ({ db: { select: vi.fn(), run: vi.fn(), get: vi.fn() } }));
vi.mock("../igdb.js", () => ({
  igdbClient: { searchGames: vi.fn(), getPopularGames: vi.fn(), formatGameData: vi.fn((g) => g) },
}));
vi.mock("../prowlarr.js", () => ({ prowlarrClient: {} }));
vi.mock("../rss.js", () => ({ rssService: { startPolling: vi.fn() } }));
vi.mock("../downloaders.js", () => ({ DownloaderManager: { getDownloaders: vi.fn() } }));
vi.mock("../socket.js", () => ({ setupWebSocket: vi.fn() }));
vi.mock("../logger.js", () => ({
  routesLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  igdbLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../ssl.js", () => ({ sslService: {} }));
vi.mock("../search.js", () => ({ searchAllIndexers: vi.fn() }));
vi.mock("../xrel.js", () => ({ xrelClient: {}, DEFAULT_XREL_BASE: "", ALLOWED_XREL_DOMAINS: [] }));
vi.mock("../config.js", () => ({
  config: {
    igdb: { clientId: undefined, clientSecret: undefined, isConfigured: false },
    server: {
      port: 5000,
      host: "0.0.0.0",
      nodeEnv: "test",
      isDevelopment: false,
      isProduction: false,
      isTest: true,
      allowedOrigins: [],
    },
    database: { url: ":memory:" },
    auth: { jwtSecret: "test-secret" },
    ssl: { enabled: false },
  },
}));
vi.mock("../config-loader.js", () => ({
  configLoader: { getConfig: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../cron.js", () => ({}));
vi.mock("../import-pipeline.js", () => ({}));
vi.mock("../torznab.js", () => ({ torznabClient: {} }));
vi.mock("../ssrf.js", () => ({ isSafeUrl: vi.fn().mockReturnValue(true), safeFetch: vi.fn() }));
vi.mock("../middleware.js", () => ({
  igdbRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  sensitiveEndpointLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  validateRequest: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeSearchQuery: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeGameId: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIgdbId: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeGameStatus: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeGameData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIndexerData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIndexerUpdateData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeDownloaderData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeDownloaderUpdateData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeDownloaderDownloadData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeRootFolderData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeRootFolderUpdateData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIndexerSearchQuery: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(storage.getUserSettings).mockResolvedValue(DEFAULT_SETTINGS as UserSettings);
  vi.mocked(storage.updateUserSettings).mockImplementation((_id, updates) =>
    Promise.resolve({ ...DEFAULT_SETTINGS, ...updates } as UserSettings)
  );
  app = express();
  app.use(express.json());
  await registerRoutes(app);
});

describe("GET /api/naming/template", () => {
  it("returns folderNamingTemplate and fileNamingTemplate from settings", async () => {
    const res = await request(app).get("/api/naming/template");
    expect(res.status).toBe(200);
    expect(res.body.folderNamingTemplate).toBe("{Title} ({Year})");
    expect(res.body.fileNamingTemplate).toBe("{Title} ({Year}) [{Group}]");
  });

  it("creates default settings when none exist", async () => {
    vi.mocked(storage.getUserSettings).mockResolvedValueOnce(undefined);
    vi.mocked(storage.createUserSettings).mockResolvedValueOnce(DEFAULT_SETTINGS as UserSettings);
    const res = await request(app).get("/api/naming/template");
    expect(res.status).toBe(200);
    expect(storage.createUserSettings).toHaveBeenCalledWith({ userId: "user-1" });
  });
});

describe("PATCH /api/naming/template", () => {
  it("updates folderNamingTemplate", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ folderNamingTemplate: "{Title}" });
    expect(res.status).toBe(200);
    expect(storage.updateUserSettings).toHaveBeenCalledWith("user-1", {
      folderNamingTemplate: "{Title}",
    });
  });

  it("rejects template containing ..", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ folderNamingTemplate: "{Title}/../escape" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/path traversal/i);
  });

  it("rejects template starting with /", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ fileNamingTemplate: "/absolute/{Title}" });
    expect(res.status).toBe(400);
  });

  it("rejects template longer than 200 chars", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ folderNamingTemplate: "A".repeat(201) });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/naming/preview", () => {
  it("returns rendered preview for each sample", async () => {
    const res = await request(app)
      .post("/api/naming/preview")
      .send({
        template: "{Title} ({Year})",
        samples: [{ title: "Elden Ring", year: 2022 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].output).toBe("Elden Ring (2022)");
  });

  it("rejects more than 10 samples", async () => {
    const samples = Array.from({ length: 11 }, (_, i) => ({ title: `Game ${i}`, year: 2020 }));
    const res = await request(app)
      .post("/api/naming/preview")
      .send({ template: "{Title}", samples });
    expect(res.status).toBe(400);
  });

  it("rejects template longer than 200 chars", async () => {
    const res = await request(app)
      .post("/api/naming/preview")
      .send({ template: "A".repeat(201), samples: [] });
    expect(res.status).toBe(400);
  });
});
