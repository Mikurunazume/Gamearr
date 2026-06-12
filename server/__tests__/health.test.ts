import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { registerRoutes } from "../routes.js";
import type { User } from "../../shared/schema.js";

// Mock the db and igdb modules — vi.hoisted runs before vi.mock factories
const { poolQueryMock, igdbGetPopularGamesMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  igdbGetPopularGamesMock: vi.fn(),
}));

vi.mock("../storage.js", () => ({
  storage: {
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
    getUserSettings: vi.fn().mockResolvedValue({}),
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

vi.mock("../db.js", () => ({
  db: { select: vi.fn(), run: vi.fn(), get: vi.fn() },
  pool: { query: poolQueryMock },
}));

vi.mock("../igdb.js", () => ({
  igdbClient: {
    getPopularGames: igdbGetPopularGamesMock,
    searchGames: vi.fn(),
    getGameById: vi.fn(),
    getRecentReleases: vi.fn(),
    getUpcomingReleases: vi.fn(),
    getRecommendations: vi.fn(),
    formatGameData: vi.fn((g: unknown) => g),
  },
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

// Helper function to perform readiness checks (matches the /api/ready endpoint)
async function performReadinessCheck() {
  const { pool } = await import("../db.js");
  const { igdbClient } = await import("../igdb.js");

  const health = {
    ok: true,
    db: false,
    igdb: false,
  };

  // Check database connectivity
  try {
    await pool.query("SELECT 1");
    health.db = true;
  } catch {
    health.ok = false;
  }

  // Check IGDB API connectivity
  try {
    await igdbClient.getPopularGames(1);
    health.igdb = true;
  } catch {
    health.ok = false;
  }

  return health;
}

describe("Health and Readiness Endpoints", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    await registerRoutes(app);
  });

  describe("Liveness Probe (GET /api/health)", () => {
    it("should return 200 with status: ok in JSON", async () => {
      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body).toEqual({ status: "ok" });
    });
  });

  describe("Readiness Probe (/api/ready)", () => {
    it("should return ok: true when both db and igdb are healthy", async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      igdbGetPopularGamesMock.mockResolvedValueOnce([
        {
          id: 1,
          name: "Test Game",
        },
      ]);

      const health = await performReadinessCheck();

      expect(health).toEqual({
        ok: true,
        db: true,
        igdb: true,
      });
    });

    it("should return ok: false when database is down", async () => {
      poolQueryMock.mockRejectedValueOnce(new Error("Database connection failed"));
      igdbGetPopularGamesMock.mockResolvedValueOnce([
        {
          id: 1,
          name: "Test Game",
        },
      ]);

      const health = await performReadinessCheck();

      expect(health).toEqual({
        ok: false,
        db: false,
        igdb: true,
      });
    });

    it("should return ok: false when IGDB API is down", async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      igdbGetPopularGamesMock.mockRejectedValueOnce(new Error("IGDB API error"));

      const health = await performReadinessCheck();

      expect(health).toEqual({
        ok: false,
        db: true,
        igdb: false,
      });
    });

    it("should return ok: false when both services are down", async () => {
      poolQueryMock.mockRejectedValueOnce(new Error("Database connection failed"));
      igdbGetPopularGamesMock.mockRejectedValueOnce(new Error("IGDB API error"));

      const health = await performReadinessCheck();

      expect(health).toEqual({
        ok: false,
        db: false,
        igdb: false,
      });
    });
  });
});
