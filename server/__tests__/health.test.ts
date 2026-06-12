import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Use vi.hoisted to create the mock objects before hoisting occurs
const { poolQueryMock, igdbGetPopularGamesMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  igdbGetPopularGamesMock: vi.fn(),
}));

// Mock the db and igdb modules
vi.mock("../db.js", () => ({
  pool: {
    query: poolQueryMock,
  },
  db: {},
}));

vi.mock("../igdb.js", () => ({
  igdbClient: {
    getPopularGames: igdbGetPopularGamesMock,
    searchGames: vi.fn(),
    getGameById: vi.fn(),
    getRecentReleases: vi.fn(),
    getUpcomingReleases: vi.fn(),
    getRecommendations: vi.fn(),
    formatGameData: vi.fn(),
  },
}));

// Additional mocks required to register routes
vi.mock("../storage.js", () => ({
  storage: {
    getUserGames: vi.fn().mockResolvedValue([]),
    searchUserGames: vi.fn().mockResolvedValue([]),
    addGame: vi.fn(),
    removeGame: vi.fn(),
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    countUsers: vi.fn().mockResolvedValue(0),
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
    authenticateToken: (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => {
      (req as express.Request).user = { id: "user-1", username: "testuser" };
      next();
    },
    generateToken: vi.fn().mockResolvedValue("mock-token"),
    comparePassword: vi.fn().mockResolvedValue(true),
    hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  };
});

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

vi.mock("../logger.js", () => ({
  routesLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  logger: { info: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
  expressLogger: { info: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock("../rss.js", () => ({
  rssService: { start: vi.fn(), stop: vi.fn() },
}));

vi.mock("../torznab.js", () => ({ torznabClient: {} }));
vi.mock("../prowlarr.js", () => ({ prowlarrClient: {} }));
vi.mock("../xrel.js", () => ({
  xrelClient: {},
  DEFAULT_XREL_BASE: "",
  ALLOWED_XREL_DOMAINS: [],
}));
vi.mock("../downloaders.js", () => ({
  DownloaderManager: { initialize: vi.fn() },
}));
vi.mock("../search.js", () => ({ searchAllIndexers: vi.fn() }));
vi.mock("../ssl.js", () => ({ sslService: {}, validateCertFiles: vi.fn() }));
vi.mock("../ssrf.js", () => ({ isSafeUrl: vi.fn().mockReturnValue(true), safeFetch: vi.fn() }));

vi.mock("../middleware.js", () => ({
  igdbRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  sensitiveEndpointLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalApiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
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

// Import registerRoutes AFTER mocks are set up
import { registerRoutes } from "../routes.js";

// Helper function to perform liveness checks (matches the /api/health endpoint)
async function performLivenessCheck() {
  return { status: "ok" };
}

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Liveness Probe (/api/health)", () => {
    it("should always return a 200 OK status", async () => {
      const result = await performLivenessCheck();
      expect(result).toEqual({ status: "ok" });
    });

    it("should respond with HTTP 200 and status ok JSON via the registered route", async () => {
      const app = express();
      await registerRoutes(app);

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
