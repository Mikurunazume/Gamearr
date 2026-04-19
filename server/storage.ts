import {
  type User,
  type InsertUser,
  type Game,
  type InsertGame,
  type UpdateGameStatus,
  type Indexer,
  type InsertIndexer,
  type Downloader,
  type InsertDownloader,
  type RootFolder,
  type InsertRootFolder,
  type UpdateRootFolder,
  type GameFile,
  type InsertGameFile,
  type UpdateGameFile,
  type GameDownload,
  type InsertGameDownload,
  type ImportTask,
  type InsertImportTask,
  type UpdateImportTask,
  type Notification,
  type InsertNotification,
  type UserSettings,
  type InsertUserSettings,
  type UpdateUserSettings,
  type XrelNotifiedRelease,
  type InsertXrelNotifiedRelease,
  type RssFeed,
  type InsertRssFeed,
  type RssFeedItem,
  type InsertRssFeedItem,
  users,
  games,
  indexers,
  downloaders,
  rootFolders,
  gameFiles,
  notifications,
  gameDownloads,
  importTasks,
  userSettings,
  systemConfig,
  xrelNotifiedReleases,
  rssFeeds,
  rssFeedItems,
} from "../shared/schema.js";
import { randomUUID } from "crypto";
import { db } from "./db.js";
import { eq, like, or, sql, desc, and, type SQL } from "drizzle-orm";

export interface IStorage {
  // System Config methods
  getSystemConfig(key: string): Promise<string | undefined>;
  setSystemConfig(key: string, value: string): Promise<void>;

  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined>;
  registerSetupUser(user: InsertUser): Promise<User>;
  countUsers(): Promise<number>;

  // Game methods
  getGame(id: string): Promise<Game | undefined>;
  getGameByIgdbId(igdbId: number): Promise<Game | undefined>;
  getUserGames(userId: string, includeHidden?: boolean): Promise<Game[]>;
  getAllGames(): Promise<Game[]>; // Keep for admin/debug or global search? Or maybe deprecated.
  getGamesByStatus(status: string): Promise<Game[]>; // Should be user scoped too
  getUserGamesByStatus(userId: string, status: string, includeHidden?: boolean): Promise<Game[]>;
  searchUserGames(userId: string, query: string, includeHidden?: boolean): Promise<Game[]>;
  searchGames(query: string): Promise<Game[]>; // Deprecated?
  addGame(game: InsertGame): Promise<Game>;
  updateGameStatus(id: string, statusUpdate: UpdateGameStatus): Promise<Game | undefined>;
  updateGameHidden(id: string, hidden: boolean): Promise<Game | undefined>;
  updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined>;
  updateGamesBatch(updates: { id: string; data: Partial<Game> }[]): Promise<void>;
  removeGame(id: string): Promise<boolean>;
  assignOrphanGamesToUser(userId: string): Promise<number>;

  // Indexer methods
  getAllIndexers(): Promise<Indexer[]>;
  getIndexer(id: string): Promise<Indexer | undefined>;
  getEnabledIndexers(): Promise<Indexer[]>;
  addIndexer(indexer: InsertIndexer): Promise<Indexer>;
  updateIndexer(id: string, updates: Partial<InsertIndexer>): Promise<Indexer | undefined>;
  removeIndexer(id: string): Promise<boolean>;
  syncIndexers(
    indexers: Partial<Indexer>[]
  ): Promise<{ added: number; updated: number; failed: number; errors: string[] }>;

  // Downloader methods
  getAllDownloaders(): Promise<Downloader[]>;
  getDownloader(id: string): Promise<Downloader | undefined>;
  getEnabledDownloaders(): Promise<Downloader[]>;
  addDownloader(downloader: InsertDownloader): Promise<Downloader>;
  updateDownloader(id: string, updates: Partial<InsertDownloader>): Promise<Downloader | undefined>;
  removeDownloader(id: string): Promise<boolean>;

  // RootFolder methods (Gamearr)
  getAllRootFolders(): Promise<RootFolder[]>;
  getRootFolder(id: string): Promise<RootFolder | undefined>;
  getRootFolderByPath(path: string): Promise<RootFolder | undefined>;
  getEnabledRootFolders(): Promise<RootFolder[]>;
  addRootFolder(folder: InsertRootFolder): Promise<RootFolder>;
  updateRootFolder(id: string, updates: UpdateRootFolder): Promise<RootFolder | undefined>;
  updateRootFolderHealth(
    id: string,
    health: { accessible: boolean; diskFreeBytes?: number | null; diskTotalBytes?: number | null }
  ): Promise<RootFolder | undefined>;
  removeRootFolder(id: string): Promise<boolean>;

  // GameFile methods (Gamearr)
  getGameFiles(gameId: string): Promise<GameFile[]>;
  getGameFile(id: string): Promise<GameFile | undefined>;
  getGameFilesByRootFolder(rootFolderId: string): Promise<GameFile[]>;
  addGameFile(file: InsertGameFile): Promise<GameFile>;
  updateGameFile(id: string, updates: UpdateGameFile): Promise<GameFile | undefined>;
  touchGameFile(id: string): Promise<GameFile | undefined>;
  removeGameFile(id: string): Promise<boolean>;

  // GameDownload methods
  getDownloadingGameDownloads(): Promise<GameDownload[]>;
  getGameDownload(id: string): Promise<GameDownload | undefined>;
  updateGameDownloadStatus(id: string, status: string): Promise<void>;
  addGameDownload(gameDownload: InsertGameDownload): Promise<GameDownload>;

  // ImportTask methods (Gamearr)
  getImportTasks(status?: string): Promise<ImportTask[]>;
  getImportTask(id: string): Promise<ImportTask | undefined>;
  getImportTasksByGameDownload(gameDownloadId: string): Promise<ImportTask[]>;
  addImportTask(task: InsertImportTask): Promise<ImportTask>;
  updateImportTask(id: string, updates: UpdateImportTask): Promise<ImportTask | undefined>;
  removeImportTask(id: string): Promise<boolean>;

  // Notification methods
  getNotifications(limit?: number): Promise<Notification[]>;
  getUnreadNotificationsCount(): Promise<number>;
  addNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(): Promise<void>;
  // RSS Feed methods
  getAllRssFeeds(): Promise<RssFeed[]>;
  getRssFeed(id: string): Promise<RssFeed | undefined>;
  addRssFeed(feed: InsertRssFeed): Promise<RssFeed>;
  updateRssFeed(id: string, updates: Partial<RssFeed>): Promise<RssFeed | undefined>;
  removeRssFeed(id: string): Promise<boolean>;
  getRssFeedItem(id: string): Promise<RssFeedItem | undefined>;
  getRssFeedItems(feedId: string): Promise<RssFeedItem[]>;
  getAllRssFeedItems(limit?: number): Promise<RssFeedItem[]>;
  addRssFeedItem(item: InsertRssFeedItem): Promise<RssFeedItem>;
  getRssFeedItemByGuid(guid: string): Promise<RssFeedItem | undefined>;
  updateRssFeedItem(
    id: string,
    updates: Partial<InsertRssFeedItem>
  ): Promise<RssFeedItem | undefined>;

  // UserSettings methods
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(
    userId: string,
    updates: UpdateUserSettings
  ): Promise<UserSettings | undefined>;

  // xREL notified releases (for notifications + "on xREL" indicator)
  addXrelNotifiedRelease(insert: InsertXrelNotifiedRelease): Promise<XrelNotifiedRelease>;
  hasXrelNotifiedRelease(gameId: string, xrelReleaseId: string): Promise<boolean>;
  getGameIdsWithXrelReleases(): Promise<string[]>;
  getWantedGamesGroupedByUser(): Promise<Map<string, Game[]>>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private games: Map<string, Game>;
  private indexers: Map<string, Indexer>;
  private downloaders: Map<string, Downloader>;
  private notifications: Map<string, Notification>;
  private gameDownloads: Map<string, GameDownload>;
  private userSettings: Map<string, UserSettings>;
  private systemConfig: Map<string, string>;
  private xrelNotified: Map<string, XrelNotifiedRelease>;
  private rssFeeds: Map<string, RssFeed>;
  private rssFeedItems: Map<string, RssFeedItem>;
  private rootFolders: Map<string, RootFolder> = new Map();
  private gameFiles: Map<string, GameFile> = new Map();
  private importTasks: Map<string, ImportTask> = new Map();

  constructor() {
    this.users = new Map();
    this.games = new Map();
    this.indexers = new Map();
    this.downloaders = new Map();
    this.notifications = new Map();
    this.gameDownloads = new Map();
    this.userSettings = new Map();
    this.systemConfig = new Map();
    this.xrelNotified = new Map();
    this.rssFeeds = new Map();
    this.rssFeedItems = new Map();
  }

  // System Config methods
  async getSystemConfig(key: string): Promise<string | undefined> {
    return this.systemConfig.get(key);
  }

  async setSystemConfig(key: string, value: string): Promise<void> {
    this.systemConfig.set(key, value);
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    const updatedUser = { ...user, passwordHash };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async registerSetupUser(insertUser: InsertUser): Promise<User> {
    if (this.users.size > 0) {
      throw new Error("Setup already completed");
    }
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Game methods
  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async getGameByIgdbId(igdbId: number): Promise<Game | undefined> {
    return Array.from(this.games.values()).find((game) => game.igdbId === igdbId);
  }

  async getUserGames(userId: string, includeHidden = false): Promise<Game[]> {
    return Array.from(this.games.values())
      .filter((game) => game.userId === userId && (includeHidden || !game.hidden))
      .sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
  }

  async getAllGames(): Promise<Game[]> {
    return Array.from(this.games.values()).sort(
      (a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime()
    );
  }

  async getGamesByStatus(status: string): Promise<Game[]> {
    return Array.from(this.games.values())
      .filter((game) => game.status === status)
      .sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
  }

  async getUserGamesByStatus(
    userId: string,
    status: string,
    includeHidden = false
  ): Promise<Game[]> {
    return Array.from(this.games.values())
      .filter(
        (game) =>
          game.userId === userId && game.status === status && (includeHidden || !game.hidden)
      )
      .sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
  }

  async searchGames(query: string): Promise<Game[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.games.values())
      .filter(
        (game) =>
          game.title.toLowerCase().includes(lowercaseQuery) ||
          game.genres?.some((genre) => genre.toLowerCase().includes(lowercaseQuery)) ||
          game.platforms?.some((platform) => platform.toLowerCase().includes(lowercaseQuery))
      )
      .sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
  }

  async searchUserGames(userId: string, query: string, includeHidden = false): Promise<Game[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.games.values())
      .filter(
        (game) =>
          game.userId === userId &&
          (includeHidden || !game.hidden) &&
          (game.title.toLowerCase().includes(lowercaseQuery) ||
            game.genres?.some((genre) => genre.toLowerCase().includes(lowercaseQuery)) ||
            game.platforms?.some((platform) => platform.toLowerCase().includes(lowercaseQuery)))
      )
      .sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
  }

  async addGame(insertGame: InsertGame): Promise<Game> {
    const id = randomUUID();
    const game: Game = {
      ...insertGame,
      id,
      userId: insertGame.userId || null,
      status: insertGame.status || "wanted",
      hidden: insertGame.hidden ?? false, // Convert boolean to number or keep as boolean depending on memory usage
      summary: insertGame.summary || null,
      coverUrl: insertGame.coverUrl || null,
      releaseDate: insertGame.releaseDate || null,
      rating: insertGame.rating || null,
      platforms: insertGame.platforms || null,
      genres: insertGame.genres || null,
      publishers: insertGame.publishers || null,
      developers: insertGame.developers || null,
      screenshots: insertGame.screenshots || null,
      igdbId: insertGame.igdbId || null,
      originalReleaseDate: insertGame.originalReleaseDate || null,
      releaseStatus: insertGame.releaseStatus || "upcoming",
      addedAt: new Date(),
      completedAt: null,
    };
    this.games.set(id, game);
    return game;
  }

  async updateGameStatus(id: string, statusUpdate: UpdateGameStatus): Promise<Game | undefined> {
    const game = this.games.get(id);
    if (!game) return undefined;

    const updatedGame: Game = {
      ...game,
      status: statusUpdate.status,
      completedAt: statusUpdate.status === "completed" ? new Date() : null,
    };

    this.games.set(id, updatedGame);
    return updatedGame;
  }

  async updateGameHidden(id: string, hidden: boolean): Promise<Game | undefined> {
    const game = this.games.get(id);
    if (!game) return undefined;

    const updatedGame: Game = {
      ...game,
      hidden: hidden,
    };

    this.games.set(id, updatedGame);
    return updatedGame;
  }

  async updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined> {
    const game = this.games.get(id);
    if (!game) return undefined;

    const updatedGame: Game = {
      ...game,
      ...updates,
    };

    this.games.set(id, updatedGame);
    return updatedGame;
  }

  async updateGamesBatch(updates: { id: string; data: Partial<Game> }[]): Promise<void> {
    for (const update of updates) {
      await this.updateGame(update.id, update.data);
    }
  }

  async removeGame(id: string): Promise<boolean> {
    return this.games.delete(id);
  }

  async assignOrphanGamesToUser(userId: string): Promise<number> {
    let count = 0;
    Array.from(this.games.values()).forEach((game) => {
      if (!game.userId) {
        const updatedGame = { ...game, userId };
        this.games.set(game.id, updatedGame);
        count++;
      }
    });
    return count;
  }

  async getWantedGamesGroupedByUser(): Promise<Map<string, Game[]>> {
    const gamesByUser = new Map<string, Game[]>();
    for (const game of Array.from(this.games.values())) {
      if (game.userId && game.status === "wanted" && !game.hidden) {
        const list = gamesByUser.get(game.userId) || [];
        list.push(game);
        gamesByUser.set(game.userId, list);
      }
    }
    return gamesByUser;
  }

  // Indexer methods
  async getAllIndexers(): Promise<Indexer[]> {
    return Array.from(this.indexers.values()).sort((a, b) => a.priority - b.priority);
  }

  async getIndexer(id: string): Promise<Indexer | undefined> {
    return this.indexers.get(id);
  }

  async getEnabledIndexers(): Promise<Indexer[]> {
    return Array.from(this.indexers.values())
      .filter((indexer) => indexer.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  async addIndexer(insertIndexer: InsertIndexer): Promise<Indexer> {
    const id = randomUUID();
    const indexer: Indexer = {
      id,
      name: insertIndexer.name,
      url: insertIndexer.url,
      apiKey: insertIndexer.apiKey,
      protocol: insertIndexer.protocol ?? "torznab",
      enabled: insertIndexer.enabled ?? true,
      priority: insertIndexer.priority ?? 1,
      categories: insertIndexer.categories ?? [],
      rssEnabled: insertIndexer.rssEnabled ?? true,
      autoSearchEnabled: insertIndexer.autoSearchEnabled ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.indexers.set(id, indexer);
    return indexer;
  }

  async updateIndexer(id: string, updates: Partial<InsertIndexer>): Promise<Indexer | undefined> {
    const indexer = this.indexers.get(id);
    if (!indexer) return undefined;

    const updatedIndexer: Indexer = {
      ...indexer,
      ...updates,
      updatedAt: new Date(),
    };

    this.indexers.set(id, updatedIndexer);
    return updatedIndexer;
  }

  async removeIndexer(id: string): Promise<boolean> {
    return this.indexers.delete(id);
  }

  async syncIndexers(
    indexersToSync: Partial<Indexer>[]
  ): Promise<{ added: number; updated: number; failed: number; errors: string[] }> {
    const results = {
      added: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const idx of indexersToSync) {
      try {
        if (!idx.name || !idx.url || !idx.apiKey) {
          results.failed++;
          results.errors.push(`Skipping ${idx.name || "unknown"} - missing required fields`);
          continue;
        }

        const existing = Array.from(this.indexers.values()).find((e) => e.url === idx.url);

        if (existing) {
          // Explicitly update only allowed fields
          const updatedIndexer: Indexer = {
            ...existing,
            name: idx.name || existing.name,
            url: idx.url || existing.url,
            apiKey: idx.apiKey || existing.apiKey,
            protocol: idx.protocol || existing.protocol,
            enabled: idx.enabled ?? existing.enabled,
            priority: idx.priority ?? existing.priority,
            categories: idx.categories || existing.categories,
            rssEnabled: idx.rssEnabled ?? existing.rssEnabled,
            autoSearchEnabled: idx.autoSearchEnabled ?? existing.autoSearchEnabled,
            updatedAt: new Date(),
          };
          this.indexers.set(existing.id, updatedIndexer);
          results.updated++;
        } else {
          const id = randomUUID();
          const newIndexer: Indexer = {
            id,
            name: idx.name,
            url: idx.url,
            apiKey: idx.apiKey,
            protocol: idx.protocol ?? "torznab",
            enabled: idx.enabled ?? true,
            priority: idx.priority ?? 1,
            categories: idx.categories ?? [],
            rssEnabled: idx.rssEnabled ?? true,
            autoSearchEnabled: idx.autoSearchEnabled ?? true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          this.indexers.set(id, newIndexer);
          results.added++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to sync ${idx.name}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return results;
  }

  // Downloader methods
  async getAllDownloaders(): Promise<Downloader[]> {
    return Array.from(this.downloaders.values()).sort((a, b) => a.priority - b.priority);
  }

  async getDownloader(id: string): Promise<Downloader | undefined> {
    return this.downloaders.get(id);
  }

  async getEnabledDownloaders(): Promise<Downloader[]> {
    return Array.from(this.downloaders.values())
      .filter((downloader) => downloader.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  async addDownloader(insertDownloader: InsertDownloader): Promise<Downloader> {
    const id = randomUUID();
    const downloader: Downloader = {
      id,
      name: insertDownloader.name,
      type: insertDownloader.type,
      url: insertDownloader.url,
      port: insertDownloader.port ?? null,
      useSsl: insertDownloader.useSsl ?? false,
      urlPath: insertDownloader.urlPath ?? null,
      username: insertDownloader.username ?? null,
      password: insertDownloader.password ?? null,
      enabled: insertDownloader.enabled ?? true,
      priority: insertDownloader.priority ?? 1,
      downloadPath: insertDownloader.downloadPath ?? null,
      category: insertDownloader.category ?? "games",
      label: insertDownloader.label ?? "Questarr",
      addStopped: insertDownloader.addStopped ?? false,
      removeCompleted: insertDownloader.removeCompleted ?? false,
      postImportCategory: insertDownloader.postImportCategory ?? null,
      defaultImportStrategy: insertDownloader.defaultImportStrategy ?? "move",
      settings: insertDownloader.settings ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.downloaders.set(id, downloader);
    return downloader;
  }

  async updateDownloader(
    id: string,
    updates: Partial<InsertDownloader>
  ): Promise<Downloader | undefined> {
    const downloader = this.downloaders.get(id);
    if (!downloader) return undefined;

    const updatedDownloader: Downloader = {
      ...downloader,
      ...updates,
      updatedAt: new Date(),
    };

    this.downloaders.set(id, updatedDownloader);
    return updatedDownloader;
  }

  async removeDownloader(id: string): Promise<boolean> {
    return this.downloaders.delete(id);
  }

  // RootFolder methods (Gamearr)
  async getAllRootFolders(): Promise<RootFolder[]> {
    return Array.from(this.rootFolders.values()).sort((a, b) => a.path.localeCompare(b.path));
  }

  async getRootFolder(id: string): Promise<RootFolder | undefined> {
    return this.rootFolders.get(id);
  }

  async getRootFolderByPath(path: string): Promise<RootFolder | undefined> {
    return Array.from(this.rootFolders.values()).find((f) => f.path === path);
  }

  async getEnabledRootFolders(): Promise<RootFolder[]> {
    return Array.from(this.rootFolders.values())
      .filter((f) => f.enabled)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async addRootFolder(insert: InsertRootFolder): Promise<RootFolder> {
    const id = randomUUID();
    const folder: RootFolder = {
      id,
      path: insert.path,
      label: insert.label,
      enabled: insert.enabled ?? true,
      accessible: false,
      diskFreeBytes: null,
      diskTotalBytes: null,
      lastHealthCheck: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rootFolders.set(id, folder);
    return folder;
  }

  async updateRootFolder(id: string, updates: UpdateRootFolder): Promise<RootFolder | undefined> {
    const folder = this.rootFolders.get(id);
    if (!folder) return undefined;
    const updated: RootFolder = { ...folder, ...updates, updatedAt: new Date() };
    this.rootFolders.set(id, updated);
    return updated;
  }

  async updateRootFolderHealth(
    id: string,
    health: { accessible: boolean; diskFreeBytes?: number | null; diskTotalBytes?: number | null }
  ): Promise<RootFolder | undefined> {
    const folder = this.rootFolders.get(id);
    if (!folder) return undefined;
    const updated: RootFolder = {
      ...folder,
      accessible: health.accessible,
      diskFreeBytes: health.diskFreeBytes ?? folder.diskFreeBytes,
      diskTotalBytes: health.diskTotalBytes ?? folder.diskTotalBytes,
      lastHealthCheck: new Date(),
      updatedAt: new Date(),
    };
    this.rootFolders.set(id, updated);
    return updated;
  }

  async removeRootFolder(id: string): Promise<boolean> {
    return this.rootFolders.delete(id);
  }

  // GameFile methods (Gamearr)
  async getGameFiles(gameId: string): Promise<GameFile[]> {
    return Array.from(this.gameFiles.values())
      .filter((f) => f.gameId === gameId)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  async getGameFile(id: string): Promise<GameFile | undefined> {
    return this.gameFiles.get(id);
  }

  async getGameFilesByRootFolder(rootFolderId: string): Promise<GameFile[]> {
    return Array.from(this.gameFiles.values()).filter((f) => f.rootFolderId === rootFolderId);
  }

  async addGameFile(insert: InsertGameFile): Promise<GameFile> {
    const id = randomUUID();
    const file: GameFile = {
      id,
      gameId: insert.gameId,
      rootFolderId: insert.rootFolderId ?? null,
      relativePath: insert.relativePath,
      sizeBytes: insert.sizeBytes,
      fileType: insert.fileType ?? "other",
      checksumSha1: insert.checksumSha1 ?? null,
      lastSeenAt: new Date(),
      addedAt: new Date(),
    };
    this.gameFiles.set(id, file);
    return file;
  }

  async updateGameFile(id: string, updates: UpdateGameFile): Promise<GameFile | undefined> {
    const file = this.gameFiles.get(id);
    if (!file) return undefined;
    const updated: GameFile = { ...file, ...updates };
    this.gameFiles.set(id, updated);
    return updated;
  }

  async touchGameFile(id: string): Promise<GameFile | undefined> {
    const file = this.gameFiles.get(id);
    if (!file) return undefined;
    const updated: GameFile = { ...file, lastSeenAt: new Date() };
    this.gameFiles.set(id, updated);
    return updated;
  }

  async removeGameFile(id: string): Promise<boolean> {
    return this.gameFiles.delete(id);
  }

  // GameDownload methods
  async getDownloadingGameDownloads(): Promise<GameDownload[]> {
    return Array.from(this.gameDownloads.values()).filter((gd) => gd.status === "downloading");
  }

  async updateGameDownloadStatus(id: string, status: string): Promise<void> {
    const gd = this.gameDownloads.get(id);
    if (gd) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.gameDownloads.set(id, { ...gd, status: status as any });
    }
  }

  async addGameDownload(insertGameDownload: InsertGameDownload): Promise<GameDownload> {
    const id = randomUUID();
    const gameDownload: GameDownload = {
      ...insertGameDownload,
      id,
      status: insertGameDownload.status || "downloading",
      downloadType: insertGameDownload.downloadType || "torrent",
      addedAt: new Date(),
      completedAt: null,
    };
    this.gameDownloads.set(id, gameDownload);
    return gameDownload;
  }

  async getGameDownload(id: string): Promise<GameDownload | undefined> {
    return this.gameDownloads.get(id);
  }

  // ImportTask methods (Gamearr)
  async getImportTasks(status?: string): Promise<ImportTask[]> {
    const list = Array.from(this.importTasks.values());
    const filtered = status ? list.filter((t) => t.status === status) : list;
    return filtered.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getImportTask(id: string): Promise<ImportTask | undefined> {
    return this.importTasks.get(id);
  }

  async getImportTasksByGameDownload(gameDownloadId: string): Promise<ImportTask[]> {
    return Array.from(this.importTasks.values())
      .filter((t) => t.gameDownloadId === gameDownloadId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async addImportTask(insert: InsertImportTask): Promise<ImportTask> {
    const id = randomUUID();
    const task: ImportTask = {
      id,
      gameDownloadId: insert.gameDownloadId,
      status: insert.status ?? "pending",
      strategy: insert.strategy ?? "move",
      sourcePath: insert.sourcePath,
      targetRootFolderId: insert.targetRootFolderId ?? null,
      targetRelativePath: insert.targetRelativePath,
      errorMessage: insert.errorMessage ?? null,
      createdAt: new Date(),
      completedAt: null,
    };
    this.importTasks.set(id, task);
    return task;
  }

  async updateImportTask(id: string, updates: UpdateImportTask): Promise<ImportTask | undefined> {
    const existing = this.importTasks.get(id);
    if (!existing) return undefined;
    const next: ImportTask = {
      ...existing,
      ...updates,
      completedAt:
        updates.status === "completed" || updates.status === "failed"
          ? new Date()
          : (existing.completedAt ?? null),
    };
    this.importTasks.set(id, next);
    return next;
  }

  async removeImportTask(id: string): Promise<boolean> {
    return this.importTasks.delete(id);
  }

  // Notification methods
  async getNotifications(limit: number = 50): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit);
  }

  async getUnreadNotificationsCount(): Promise<number> {
    return Array.from(this.notifications.values()).filter((n) => !n.read).length;
  }

  async addNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification: Notification = {
      id,
      userId: insertNotification.userId ?? null,
      type: insertNotification.type,
      title: insertNotification.title,
      message: insertNotification.message,
      link: insertNotification.link ?? null,
      read: false,
      createdAt: new Date(),
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const notification = this.notifications.get(id);
    if (!notification) return undefined;

    const updatedNotification: Notification = {
      ...notification,
      read: true,
    };
    this.notifications.set(id, updatedNotification);
    return updatedNotification;
  }

  async markAllNotificationsAsRead(): Promise<void> {
    Array.from(this.notifications.entries()).forEach(([id, notification]) => {
      if (!notification.read) {
        this.notifications.set(id, { ...notification, read: true });
      }
    });
  }

  async clearAllNotifications(): Promise<void> {
    this.notifications.clear();
  }

  // RSS Feed methods
  async getAllRssFeeds(): Promise<RssFeed[]> {
    return Array.from(this.rssFeeds.values());
  }

  async getRssFeed(id: string): Promise<RssFeed | undefined> {
    return this.rssFeeds.get(id);
  }

  async addRssFeed(feed: InsertRssFeed): Promise<RssFeed> {
    const id = randomUUID();
    const newFeed: RssFeed = {
      ...feed,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastCheck: null,
      status: "ok",
      errorMessage: null,
      type: feed.type || "custom",
      enabled: feed.enabled ?? true,
      mapping: feed.mapping || null,
    };
    this.rssFeeds.set(id, newFeed);
    return newFeed;
  }

  async updateRssFeed(id: string, updates: Partial<RssFeed>): Promise<RssFeed | undefined> {
    const feed = this.rssFeeds.get(id);
    if (!feed) return undefined;
    const updatedFeed = { ...feed, ...updates, updatedAt: new Date() };
    this.rssFeeds.set(id, updatedFeed);
    return updatedFeed;
  }

  async removeRssFeed(id: string): Promise<boolean> {
    return this.rssFeeds.delete(id);
  }

  async getRssFeedItem(id: string): Promise<RssFeedItem | undefined> {
    return this.rssFeedItems.get(id);
  }

  async getRssFeedItems(feedId: string): Promise<RssFeedItem[]> {
    return Array.from(this.rssFeedItems.values())
      .filter((item) => item.feedId === feedId)
      .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
  }

  async getAllRssFeedItems(limit: number = 100): Promise<RssFeedItem[]> {
    return Array.from(this.rssFeedItems.values())
      .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0))
      .slice(0, limit);
  }

  async addRssFeedItem(item: InsertRssFeedItem): Promise<RssFeedItem> {
    const id = randomUUID();
    const newItem: RssFeedItem = {
      ...item,
      id,
      createdAt: new Date(),
      igdbGameId: item.igdbGameId ?? null,
      igdbGameName: item.igdbGameName ?? null,
      coverUrl: item.coverUrl ?? null,
      pubDate: item.pubDate ?? null,
      sourceName: item.sourceName ?? null,
    };
    this.rssFeedItems.set(id, newItem);
    return newItem;
  }

  async getRssFeedItemByGuid(guid: string): Promise<RssFeedItem | undefined> {
    return Array.from(this.rssFeedItems.values()).find((item) => item.guid === guid);
  }

  async updateRssFeedItem(
    id: string,
    updates: Partial<InsertRssFeedItem>
  ): Promise<RssFeedItem | undefined> {
    const item = this.rssFeedItems.get(id);
    if (!item) return undefined;
    const updatedItem = { ...item, ...updates };
    this.rssFeedItems.set(id, updatedItem);
    return updatedItem;
  }

  // UserSettings methods
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    return Array.from(this.userSettings.values()).find((settings) => settings.userId === userId);
  }

  async createUserSettings(insertSettings: InsertUserSettings): Promise<UserSettings> {
    const id = randomUUID();
    const settings: UserSettings = {
      id,
      userId: insertSettings.userId,
      autoSearchEnabled: insertSettings.autoSearchEnabled ?? true,
      autoDownloadEnabled: insertSettings.autoDownloadEnabled ?? false,
      notifyMultipleDownloads: insertSettings.notifyMultipleDownloads ?? true,
      notifyUpdates: insertSettings.notifyUpdates ?? true,
      searchIntervalHours: insertSettings.searchIntervalHours ?? 6,
      igdbRateLimitPerSecond: insertSettings.igdbRateLimitPerSecond ?? 3,
      downloadRules: insertSettings.downloadRules ?? null,
      lastAutoSearch: insertSettings.lastAutoSearch ?? null,
      xrelSceneReleases: insertSettings.xrelSceneReleases ?? true,
      xrelP2pReleases: insertSettings.xrelP2pReleases ?? false,
      updatedAt: new Date(),
    };
    this.userSettings.set(id, settings);
    return settings;
  }

  async updateUserSettings(
    userId: string,
    updates: UpdateUserSettings
  ): Promise<UserSettings | undefined> {
    const existing = await this.getUserSettings(userId);
    if (!existing) return undefined;

    const updated: UserSettings = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.userSettings.set(existing.id, updated);
    return updated;
  }

  async addXrelNotifiedRelease(insert: InsertXrelNotifiedRelease): Promise<XrelNotifiedRelease> {
    const id = randomUUID();
    const row: XrelNotifiedRelease = {
      id,
      gameId: insert.gameId,
      xrelReleaseId: insert.xrelReleaseId,
      createdAt: new Date(),
    };
    this.xrelNotified.set(`${insert.gameId}:${insert.xrelReleaseId}`, row);
    return row;
  }

  async hasXrelNotifiedRelease(gameId: string, xrelReleaseId: string): Promise<boolean> {
    return this.xrelNotified.has(`${gameId}:${xrelReleaseId}`);
  }

  async getGameIdsWithXrelReleases(): Promise<string[]> {
    const ids = new Set<string>();
    Array.from(this.xrelNotified.values()).forEach((r) => ids.add(r.gameId));
    return Array.from(ids);
  }
}

export class DatabaseStorage implements IStorage {
  // System Config methods
  async getSystemConfig(key: string): Promise<string | undefined> {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
    return config?.value;
  }

  async setSystemConfig(key: string, value: string): Promise<void> {
    await db
      .insert(systemConfig)
      .values({ key, value })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: { value, updatedAt: new Date() },
      });
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Manually generate UUID for SQLite
    const id = randomUUID();
    const [user] = await db
      .insert(users)
      .values({ ...insertUser, id })
      .returning();
    return user;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async countUsers(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(users);
    return result.count;
  }

  async registerSetupUser(insertUser: InsertUser): Promise<User> {
    return db.transaction((tx) => {
      const [result] = tx
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .all();

      if (result.count > 0) {
        throw new Error("Setup already completed");
      }

      // Manually generate UUID for SQLite
      const id = randomUUID();
      const [user] = tx
        .insert(users)
        .values({ ...insertUser, id })
        .returning()
        .all();
      return user;
    });
  }

  // Game methods
  async getGame(id: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game || undefined;
  }

  async getGameByIgdbId(igdbId: number): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.igdbId, igdbId));
    return game || undefined;
  }

  async getUserGames(userId: string, includeHidden = false): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(and(eq(games.userId, userId), includeHidden ? undefined : eq(games.hidden, false)))
      .orderBy(sql`${games.addedAt} DESC`);
  }

  async getAllGames(): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .orderBy(sql`${games.addedAt} DESC`);
  }

  async getGamesByStatus(status: string): Promise<Game[]> {
    return (
      db
        .select()
        .from(games)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where(eq(games.status, status as any))
        .orderBy(sql`${games.addedAt} DESC`)
    );
  }

  async getUserGamesByStatus(
    userId: string,
    status: string,
    includeHidden = false
  ): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(
        and(
          eq(games.userId, userId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eq(games.status, status as any),
          includeHidden ? undefined : eq(games.hidden, false)
        )
      )
      .orderBy(sql`${games.addedAt} DESC`);
  }

  async searchGames(query: string): Promise<Game[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    return db
      .select()
      .from(games)
      .where(
        or(
          like(sql`lower(${games.title})`, searchTerm),
          // SQLite JSON array search workaround or explicit JSON handling
          // Using LIKE for simple array search since platforms/genres are JSON arrays of strings
          like(sql`lower(${games.genres})`, searchTerm),
          like(sql`lower(${games.platforms})`, searchTerm)
        )
      )
      .orderBy(sql`${games.addedAt} DESC`);
  }

  async searchUserGames(userId: string, query: string, includeHidden = false): Promise<Game[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    return db
      .select()
      .from(games)
      .where(
        and(
          eq(games.userId, userId),
          includeHidden ? undefined : eq(games.hidden, false),
          or(
            like(sql`lower(${games.title})`, searchTerm),
            like(sql`lower(${games.genres})`, searchTerm),
            like(sql`lower(${games.platforms})`, searchTerm)
          )
        )
      )
      .orderBy(sql`${games.addedAt} DESC`);
  }

  async addGame(insertGame: InsertGame): Promise<Game> {
    const gameWithId = {
      id: randomUUID(),
      userId: insertGame.userId ?? null,
      title: insertGame.title,
      igdbId: insertGame.igdbId ?? null,
      summary: insertGame.summary ?? null,
      coverUrl: insertGame.coverUrl ?? null,
      releaseDate: insertGame.releaseDate ?? null,
      rating: insertGame.rating ?? null,
      platforms: insertGame.platforms ?? null,
      genres: insertGame.genres ?? null,
      publishers: insertGame.publishers ?? null,
      developers: insertGame.developers ?? null,
      screenshots: insertGame.screenshots ?? null,
      status: insertGame.status ?? "wanted",
      hidden: insertGame.hidden ?? false,
      originalReleaseDate: insertGame.originalReleaseDate ?? null,
      releaseStatus: insertGame.releaseStatus ?? "upcoming",
      addedAt: new Date(),
    };

    const [game] = await db.insert(games).values(gameWithId).returning();
    return game;
  }

  async updateGameStatus(id: string, statusUpdate: UpdateGameStatus): Promise<Game | undefined> {
    const [updatedGame] = await db
      .update(games)
      .set({
        status: statusUpdate.status,
        completedAt: statusUpdate.status === "completed" ? new Date() : null,
      })
      .where(eq(games.id, id))
      .returning();

    return updatedGame || undefined;
  }

  async updateGameHidden(id: string, hidden: boolean): Promise<Game | undefined> {
    const [updatedGame] = await db
      .update(games)
      .set({ hidden })
      .where(eq(games.id, id))
      .returning();
    return updatedGame || undefined;
  }

  async updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined> {
    const [updatedGame] = await db.update(games).set(updates).where(eq(games.id, id)).returning();

    return updatedGame || undefined;
  }

  async updateGamesBatch(updates: { id: string; data: Partial<Game> }[]): Promise<void> {
    db.transaction((tx) => {
      for (const update of updates) {
        tx.update(games).set(update.data).where(eq(games.id, update.id)).run();
      }
    });
  }

  async removeGame(id: string): Promise<boolean> {
    const _result = await db.delete(games).where(eq(games.id, id));
    return true;
  }

  async assignOrphanGamesToUser(userId: string): Promise<number> {
    const result = await db
      .update(games)
      .set({ userId })
      .where(sql`${games.userId} IS NULL`)
      .returning();
    return result.length;
  }

  async getWantedGamesGroupedByUser(): Promise<Map<string, Game[]>> {
    const wantedGames = await db
      .select()
      .from(games)
      .where(
        and(eq(games.status, "wanted"), eq(games.hidden, false), sql`${games.userId} IS NOT NULL`)
      );

    const gamesByUser = new Map<string, Game[]>();
    for (const game of wantedGames) {
      if (game.userId) {
        const list = gamesByUser.get(game.userId) || [];
        list.push(game);
        gamesByUser.set(game.userId, list);
      }
    }
    return gamesByUser;
  }

  // Indexer methods
  async getAllIndexers(): Promise<Indexer[]> {
    return db.select().from(indexers).orderBy(indexers.priority);
  }

  async getIndexer(id: string): Promise<Indexer | undefined> {
    const [indexer] = await db.select().from(indexers).where(eq(indexers.id, id));
    return indexer || undefined;
  }

  async getEnabledIndexers(): Promise<Indexer[]> {
    return db.select().from(indexers).where(eq(indexers.enabled, true)).orderBy(indexers.priority);
  }

  async addIndexer(insertIndexer: InsertIndexer): Promise<Indexer> {
    // Generate UUID manually
    const id = randomUUID();
    const [indexer] = await db
      .insert(indexers)
      .values({ ...insertIndexer, id })
      .returning();
    return indexer;
  }

  async updateIndexer(id: string, updates: Partial<InsertIndexer>): Promise<Indexer | undefined> {
    const [updatedIndexer] = await db
      .update(indexers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(indexers.id, id))
      .returning();

    return updatedIndexer || undefined;
  }

  async removeIndexer(id: string): Promise<boolean> {
    await db.delete(indexers).where(eq(indexers.id, id));
    return true;
  }

  async syncIndexers(
    indexersToSync: Partial<Indexer>[]
  ): Promise<{ added: number; updated: number; failed: number; errors: string[] }> {
    const results = {
      added: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    db.transaction((tx) => {
      // Fetch all existing indexers within the transaction to compare against
      const existingIndexers = tx.select().from(indexers).all();
      const existingMap = new Map(existingIndexers.map((i) => [i.url, i]));

      for (const idx of indexersToSync) {
        try {
          if (!idx.name || !idx.url || !idx.apiKey) {
            results.failed++;
            results.errors.push(`Skipping ${idx.name || "unknown"} - missing required fields`);
            continue;
          }

          const existing = existingMap.get(idx.url);

          if (existing) {
            // Explicitly set allowed fields for update to prevent mass assignment
            tx.update(indexers)
              .set({
                name: idx.name,
                url: idx.url,
                apiKey: idx.apiKey,
                protocol: idx.protocol,
                enabled: idx.enabled,
                priority: idx.priority,
                categories: idx.categories,
                rssEnabled: idx.rssEnabled,
                autoSearchEnabled: idx.autoSearchEnabled,
                updatedAt: new Date(),
              })
              .where(eq(indexers.id, existing.id))
              .run();
            results.updated++;
          } else {
            const id = randomUUID();
            // Default values for missing optional fields
            const newIndexer = {
              id,
              name: idx.name,
              url: idx.url,
              apiKey: idx.apiKey,
              protocol: idx.protocol ?? "torznab",
              enabled: idx.enabled ?? true,
              priority: idx.priority ?? 1,
              categories: idx.categories ?? [],
              rssEnabled: idx.rssEnabled ?? true,
              autoSearchEnabled: idx.autoSearchEnabled ?? true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            tx.insert(indexers).values(newIndexer).run();
            results.added++;
          }
        } catch (error) {
          results.failed++;
          results.errors.push(
            `Failed to sync ${idx.name}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }
    });

    return results;
  }

  // Downloader methods
  async getAllDownloaders(): Promise<Downloader[]> {
    return db.select().from(downloaders).orderBy(downloaders.priority);
  }

  async getDownloader(id: string): Promise<Downloader | undefined> {
    const [downloader] = await db.select().from(downloaders).where(eq(downloaders.id, id));
    return downloader || undefined;
  }

  async getEnabledDownloaders(): Promise<Downloader[]> {
    return db
      .select()
      .from(downloaders)
      .where(eq(downloaders.enabled, true))
      .orderBy(downloaders.priority);
  }

  async addDownloader(insertDownloader: InsertDownloader): Promise<Downloader> {
    const id = randomUUID();
    const [downloader] = await db
      .insert(downloaders)
      .values({ ...insertDownloader, id })
      .returning();
    return downloader;
  }

  async updateDownloader(
    id: string,
    updates: Partial<InsertDownloader>
  ): Promise<Downloader | undefined> {
    const [updatedDownloader] = await db
      .update(downloaders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(downloaders.id, id))
      .returning();

    return updatedDownloader || undefined;
  }

  async removeDownloader(id: string): Promise<boolean> {
    await db.delete(downloaders).where(eq(downloaders.id, id));
    return true;
  }

  // RootFolder methods (Gamearr)
  async getAllRootFolders(): Promise<RootFolder[]> {
    return db.select().from(rootFolders).orderBy(rootFolders.path);
  }

  async getRootFolder(id: string): Promise<RootFolder | undefined> {
    const [folder] = await db.select().from(rootFolders).where(eq(rootFolders.id, id));
    return folder || undefined;
  }

  async getRootFolderByPath(path: string): Promise<RootFolder | undefined> {
    const [folder] = await db.select().from(rootFolders).where(eq(rootFolders.path, path));
    return folder || undefined;
  }

  async getEnabledRootFolders(): Promise<RootFolder[]> {
    return db
      .select()
      .from(rootFolders)
      .where(eq(rootFolders.enabled, true))
      .orderBy(rootFolders.path);
  }

  async addRootFolder(insert: InsertRootFolder): Promise<RootFolder> {
    const id = randomUUID();
    const [folder] = await db
      .insert(rootFolders)
      .values({ ...insert, id })
      .returning();
    return folder;
  }

  async updateRootFolder(id: string, updates: UpdateRootFolder): Promise<RootFolder | undefined> {
    const [updated] = await db
      .update(rootFolders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rootFolders.id, id))
      .returning();
    return updated || undefined;
  }

  async updateRootFolderHealth(
    id: string,
    health: { accessible: boolean; diskFreeBytes?: number | null; diskTotalBytes?: number | null }
  ): Promise<RootFolder | undefined> {
    const [updated] = await db
      .update(rootFolders)
      .set({
        accessible: health.accessible,
        diskFreeBytes: health.diskFreeBytes ?? null,
        diskTotalBytes: health.diskTotalBytes ?? null,
        lastHealthCheck: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rootFolders.id, id))
      .returning();
    return updated || undefined;
  }

  async removeRootFolder(id: string): Promise<boolean> {
    await db.delete(rootFolders).where(eq(rootFolders.id, id));
    return true;
  }

  // GameFile methods (Gamearr)
  async getGameFiles(gameId: string): Promise<GameFile[]> {
    return db
      .select()
      .from(gameFiles)
      .where(eq(gameFiles.gameId, gameId))
      .orderBy(gameFiles.relativePath);
  }

  async getGameFile(id: string): Promise<GameFile | undefined> {
    const [file] = await db.select().from(gameFiles).where(eq(gameFiles.id, id));
    return file || undefined;
  }

  async getGameFilesByRootFolder(rootFolderId: string): Promise<GameFile[]> {
    return db.select().from(gameFiles).where(eq(gameFiles.rootFolderId, rootFolderId));
  }

  async addGameFile(insert: InsertGameFile): Promise<GameFile> {
    const id = randomUUID();
    const [file] = await db
      .insert(gameFiles)
      .values({ ...insert, id })
      .returning();
    return file;
  }

  async updateGameFile(id: string, updates: UpdateGameFile): Promise<GameFile | undefined> {
    const [updated] = await db
      .update(gameFiles)
      .set(updates)
      .where(eq(gameFiles.id, id))
      .returning();
    return updated || undefined;
  }

  async touchGameFile(id: string): Promise<GameFile | undefined> {
    const [updated] = await db
      .update(gameFiles)
      .set({ lastSeenAt: new Date() })
      .where(eq(gameFiles.id, id))
      .returning();
    return updated || undefined;
  }

  async removeGameFile(id: string): Promise<boolean> {
    await db.delete(gameFiles).where(eq(gameFiles.id, id));
    return true;
  }

  // GameDownload methods
  async getDownloadingGameDownloads(): Promise<GameDownload[]> {
    return db
      .select()
      .from(gameDownloads)
      .where(
        or(
          eq(gameDownloads.status, "downloading"),
          eq(gameDownloads.status, "paused"),
          eq(gameDownloads.status, "failed")
        ) as SQL
      );
  }

  async updateGameDownloadStatus(id: string, status: string): Promise<void> {
    await db
      .update(gameDownloads)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ status: status as any, completedAt: status === "completed" ? new Date() : null })
      .where(eq(gameDownloads.id, id));
  }

  async addGameDownload(insertGameDownload: InsertGameDownload): Promise<GameDownload> {
    const id = randomUUID();
    const [gameDownload] = await db
      .insert(gameDownloads)
      .values({ ...insertGameDownload, id })
      .returning();
    return gameDownload;
  }

  async getGameDownload(id: string): Promise<GameDownload | undefined> {
    const [row] = await db.select().from(gameDownloads).where(eq(gameDownloads.id, id));
    return row || undefined;
  }

  // ImportTask methods (Gamearr)
  async getImportTasks(status?: string): Promise<ImportTask[]> {
    const query = status
      ? db.select().from(importTasks).where(eq(importTasks.status, status))
      : db.select().from(importTasks);
    const rows = await query;
    return rows.sort(
      (a: ImportTask, b: ImportTask) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getImportTask(id: string): Promise<ImportTask | undefined> {
    const [row] = await db.select().from(importTasks).where(eq(importTasks.id, id));
    return row || undefined;
  }

  async getImportTasksByGameDownload(gameDownloadId: string): Promise<ImportTask[]> {
    return db
      .select()
      .from(importTasks)
      .where(eq(importTasks.gameDownloadId, gameDownloadId))
      .orderBy(desc(importTasks.createdAt));
  }

  async addImportTask(insert: InsertImportTask): Promise<ImportTask> {
    const id = randomUUID();
    const [row] = await db
      .insert(importTasks)
      .values({ ...insert, id })
      .returning();
    return row;
  }

  async updateImportTask(id: string, updates: UpdateImportTask): Promise<ImportTask | undefined> {
    const completedAt =
      updates.status === "completed" || updates.status === "failed" ? new Date() : undefined;
    const [row] = await db
      .update(importTasks)
      .set({
        ...updates,
        ...(completedAt !== undefined ? { completedAt } : {}),
      })
      .where(eq(importTasks.id, id))
      .returning();
    return row || undefined;
  }

  async removeImportTask(id: string): Promise<boolean> {
    const [deleted] = await db.delete(importTasks).where(eq(importTasks.id, id)).returning();
    return !!deleted;
  }

  // Notification methods
  async getNotifications(limit: number = 50): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
  }

  async getUnreadNotificationsCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.read, false));
    return result.count;
  }

  async addNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const [notification] = await db
      .insert(notifications)
      .values({ ...insertNotification, id })
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [updatedNotification] = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id))
      .returning();
    return updatedNotification || undefined;
  }

  async markAllNotificationsAsRead(): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
  }

  async clearAllNotifications(): Promise<void> {
    await db.delete(notifications);
  }

  // RSS Feed methods
  async getAllRssFeeds(): Promise<RssFeed[]> {
    return db.select().from(rssFeeds);
  }

  async getRssFeed(id: string): Promise<RssFeed | undefined> {
    const [feed] = await db.select().from(rssFeeds).where(eq(rssFeeds.id, id));
    return feed;
  }

  async addRssFeed(feed: InsertRssFeed): Promise<RssFeed> {
    const id = randomUUID();
    const [newFeed] = await db
      .insert(rssFeeds)
      .values({ ...feed, id })
      .returning();
    return newFeed;
  }

  async updateRssFeed(id: string, updates: Partial<RssFeed>): Promise<RssFeed | undefined> {
    const [updated] = await db
      .update(rssFeeds)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rssFeeds.id, id))
      .returning();
    return updated;
  }

  async removeRssFeed(id: string): Promise<boolean> {
    const [deleted] = await db.delete(rssFeeds).where(eq(rssFeeds.id, id)).returning();
    return !!deleted;
  }

  async getRssFeedItem(id: string): Promise<RssFeedItem | undefined> {
    const [item] = await db.select().from(rssFeedItems).where(eq(rssFeedItems.id, id));
    return item;
  }

  async getRssFeedItems(feedId: string): Promise<RssFeedItem[]> {
    return db
      .select()
      .from(rssFeedItems)
      .where(eq(rssFeedItems.feedId, feedId))
      .orderBy(desc(rssFeedItems.pubDate));
  }

  async getAllRssFeedItems(limit: number = 100): Promise<RssFeedItem[]> {
    return db.select().from(rssFeedItems).orderBy(desc(rssFeedItems.pubDate)).limit(limit);
  }

  async addRssFeedItem(item: InsertRssFeedItem): Promise<RssFeedItem> {
    const id = randomUUID();
    const [newItem] = await db
      .insert(rssFeedItems)
      .values({ ...item, id })
      .returning();
    return newItem;
  }

  async getRssFeedItemByGuid(guid: string): Promise<RssFeedItem | undefined> {
    const [item] = await db.select().from(rssFeedItems).where(eq(rssFeedItems.guid, guid));
    return item;
  }

  async updateRssFeedItem(
    id: string,
    updates: Partial<InsertRssFeedItem>
  ): Promise<RssFeedItem | undefined> {
    const [updated] = await db
      .update(rssFeedItems)
      .set(updates)
      .where(eq(rssFeedItems.id, id))
      .returning();
    return updated;
  }

  // UserSettings methods
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return settings || undefined;
  }

  async createUserSettings(insertSettings: InsertUserSettings): Promise<UserSettings> {
    const id = randomUUID();
    const [settings] = await db
      .insert(userSettings)
      .values({ ...insertSettings, id })
      .returning();
    return settings;
  }

  async updateUserSettings(
    userId: string,
    updates: UpdateUserSettings
  ): Promise<UserSettings | undefined> {
    const [updated] = await db
      .update(userSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();
    return updated || undefined;
  }

  async addXrelNotifiedRelease(insert: InsertXrelNotifiedRelease): Promise<XrelNotifiedRelease> {
    const id = randomUUID();
    const [row] = await db
      .insert(xrelNotifiedReleases)
      .values({ ...insert, id })
      .returning();
    return row;
  }

  async hasXrelNotifiedRelease(gameId: string, xrelReleaseId: string): Promise<boolean> {
    const rows = await db
      .select()
      .from(xrelNotifiedReleases)
      .where(
        and(
          eq(xrelNotifiedReleases.gameId, gameId),
          eq(xrelNotifiedReleases.xrelReleaseId, xrelReleaseId)
        )
      );
    return rows.length > 0;
  }

  async getGameIdsWithXrelReleases(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ gameId: xrelNotifiedReleases.gameId })
      .from(xrelNotifiedReleases);
    return rows.map((r) => r.gameId);
  }
}

export const storage = new DatabaseStorage();
