// Gamearr: recursive library scanner with IGDB matching.
// Turns Gamearr into a proper *arr — scans configured root folders, matches
// each candidate directory against IGDB, inserts games + game_files rows.
//
// Design choices:
// - "Leaf at root level = one game": every immediate child directory of a
//   configured root folder is treated as a single game candidate. We do NOT
//   recurse into subdirectories looking for nested games (prevents mis-
//   matching DLC folders or extras as separate games).
// - File tracking is a 2-level recursion: direct files in the game dir and
//   files one level deeper (e.g. `The Witcher 3/Patches/` → still counted).
// - Matching is intentionally conservative: we only auto-link when the best
//   IGDB candidate is a strong match. Otherwise the folder lands in the
//   "unmatched" list so the user can resolve it via the UI.

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { storage } from "./storage.js";
import { igdbClient, type IGDBGame } from "./igdb.js";
import { normalizeTitle, cleanReleaseName } from "../shared/title-utils.js";
import { igdbLogger, routesLogger } from "./logger.js";
import { notifyUser } from "./socket.js";
import type { InsertGame, InsertGameFile } from "../shared/schema.js";

// ---------- Types ----------

export interface ScanProgress {
  rootFolderId: string;
  rootFolderPath: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "completed" | "failed";
  totalCandidates: number;
  processedCandidates: number;
  matched: number;
  unmatched: number;
  errors: number;
  currentCandidate?: string;
  errorMessage?: string;
}

export interface UnmatchedEntry {
  rootFolderId: string;
  rootFolderPath: string;
  folderName: string; // relative to root (the leaf)
  absolutePath: string;
  candidates: Array<{ igdbId: number; name: string; releaseYear: number | null }>;
}

interface FolderCandidate {
  folderName: string;
  absolutePath: string;
}

// ---------- File type detection ----------

// Extensions we actively index as game assets
const INSTALLER_EXTS = new Set([".exe", ".msi"]);
const ISO_EXTS = new Set([".iso", ".bin", ".img"]);
const ARCHIVE_EXTS = new Set([".zip", ".rar", ".7z"]);

// Extensions we SKIP entirely (not indexed, not counted)
const IGNORED_EXTS = new Set([
  ".nfo",
  ".txt",
  ".md5",
  ".sha1",
  ".sfv",
  ".ds_store",
  ".url",
  ".html",
  ".htm",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
]);

export function classifyFile(
  filename: string
): "installer" | "iso" | "archive" | "other" | "ignore" {
  const ext = path.extname(filename).toLowerCase();
  if (IGNORED_EXTS.has(ext)) return "ignore";
  if (INSTALLER_EXTS.has(ext)) return "installer";
  if (ISO_EXTS.has(ext)) return "iso";
  if (ARCHIVE_EXTS.has(ext)) return "archive";
  return "other";
}

// ---------- Progress store ----------

const progressByFolder = new Map<string, ScanProgress>();
const unmatchedByFolder = new Map<string, UnmatchedEntry[]>();

export function getAllScanProgress(): ScanProgress[] {
  return Array.from(progressByFolder.values());
}

export function getScanProgress(rootFolderId: string): ScanProgress | undefined {
  return progressByFolder.get(rootFolderId);
}

export function getAllUnmatched(): UnmatchedEntry[] {
  return Array.from(unmatchedByFolder.values()).flat();
}

export function clearUnmatched(rootFolderId: string, folderName: string): void {
  const list = unmatchedByFolder.get(rootFolderId);
  if (!list) return;
  const filtered = list.filter((e) => e.folderName !== folderName);
  if (filtered.length === 0) {
    unmatchedByFolder.delete(rootFolderId);
  } else {
    unmatchedByFolder.set(rootFolderId, filtered);
  }
}

function emitProgress(p: ScanProgress) {
  notifyUser("library-scan-progress", p);
}

// ---------- Folder listing ----------

async function listCandidates(rootPath: string): Promise<FolderCandidate[]> {
  const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ folderName: e.name, absolutePath: path.join(rootPath, e.name) }));
}

async function listFiles(
  folderAbsPath: string,
  maxDepth = 2
): Promise<Array<{ relativeTo: string; size: number }>> {
  const results: Array<{ relativeTo: string; size: number }> = [];
  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await walk(abs, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(abs);
          results.push({ relativeTo: abs, size: stat.size });
        } catch {
          // Unreadable file — skip
        }
      }
    }
  }
  await walk(folderAbsPath, 0);
  return results;
}

// ---------- IGDB matching ----------

/**
 * Score how well an IGDB name matches the folder's cleaned title.
 * Returns a number in [0, 1]. >= 0.85 is treated as an auto-match.
 */
function scoreMatch(folderClean: string, igdbName: string): number {
  const a = normalizeTitle(folderClean);
  const b = normalizeTitle(igdbName);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const aArr = a.split(" ").filter(Boolean);
  const bArr = b.split(" ").filter(Boolean);
  const aWords = new Set(aArr);
  const bWords = new Set(bArr);
  let inter = 0;
  aWords.forEach((w) => {
    if (bWords.has(w)) inter += 1;
  });
  const unionSet = new Set<string>();
  aArr.forEach((w) => unionSet.add(w));
  bArr.forEach((w) => unionSet.add(w));
  const union = unionSet.size;
  if (union === 0) return 0;
  const jaccard = inter / union;

  // Prefix bonus: exact starts-with in either direction
  const prefixBonus = a.startsWith(b) || b.startsWith(a) ? 0.1 : 0;

  return Math.min(1, jaccard + prefixBonus);
}

async function bestIgdbMatch(folderName: string): Promise<{
  best: IGDBGame | null;
  candidates: IGDBGame[];
  cleaned: string;
  score: number;
}> {
  const cleaned = cleanReleaseName(folderName);
  const query = cleaned || folderName;
  let candidates: IGDBGame[] = [];
  try {
    candidates = await igdbClient.searchGames(query, 5);
  } catch (err) {
    igdbLogger.warn({ err, query }, "IGDB search failed during scan");
    return { best: null, candidates: [], cleaned, score: 0 };
  }

  if (candidates.length === 0) {
    return { best: null, candidates: [], cleaned, score: 0 };
  }

  // Pick the candidate with the highest score. Ties broken by IGDB ranking order.
  let best = candidates[0];
  let bestScore = scoreMatch(cleaned, best.name);
  for (let i = 1; i < candidates.length; i += 1) {
    const s = scoreMatch(cleaned, candidates[i].name);
    if (s > bestScore) {
      best = candidates[i];
      bestScore = s;
    }
  }
  return { best, candidates, cleaned, score: bestScore };
}

// ---------- Ingestion ----------

function igdbToInsertGame(igdb: IGDBGame): InsertGame {
  const releaseDate = igdb.first_release_date
    ? new Date(igdb.first_release_date * 1000).toISOString().slice(0, 10)
    : null;
  return {
    igdbId: igdb.id,
    title: igdb.name,
    summary: igdb.summary ?? null,
    coverUrl: igdb.cover?.url ? `https:${igdb.cover.url.replace("t_thumb", "t_cover_big")}` : null,
    releaseDate,
    rating: igdb.rating ?? null,
    platforms: igdb.platforms?.map((p) => p.name) ?? [],
    genres: igdb.genres?.map((g) => g.name) ?? [],
    publishers:
      igdb.involved_companies?.filter((c) => c.publisher).map((c) => c.company.name) ?? [],
    developers:
      igdb.involved_companies?.filter((c) => c.developer).map((c) => c.company.name) ?? [],
    screenshots:
      igdb.screenshots?.map((s) => `https:${s.url.replace("t_thumb", "t_screenshot_big")}`) ?? [],
    status: "owned",
    releaseStatus: "released",
    userId: null,
  } as InsertGame;
}

/**
 * Auto-assign scanned files to a game.
 * If the game already exists (matched by igdbId), we only add files that are not
 * already tracked (dedup by relativePath).
 */
export async function assignFilesToGame(
  gameId: string,
  rootFolderId: string,
  rootFolderAbsPath: string,
  folderName: string,
  files: Array<{ relativeTo: string; size: number }>
): Promise<number> {
  const existing = await storage.getGameFiles(gameId);
  const existingPaths = new Set(existing.map((f) => f.relativePath));

  let added = 0;
  for (const f of files) {
    const fileRelativeToRoot = path.relative(rootFolderAbsPath, f.relativeTo);
    const fileType = classifyFile(f.relativeTo);
    if (fileType === "ignore") continue;
    if (existingPaths.has(fileRelativeToRoot)) {
      // Still fresh — refresh lastSeenAt on the existing row
      const existingRow = existing.find((e) => e.relativePath === fileRelativeToRoot);
      if (existingRow) await storage.touchGameFile(existingRow.id);
      continue;
    }
    const insert: InsertGameFile = {
      gameId,
      rootFolderId,
      relativePath: fileRelativeToRoot,
      sizeBytes: f.size,
      fileType,
      checksumSha1: null,
    };
    await storage.addGameFile(insert);
    added += 1;
  }
  // Void: the scanner is the one that gives full context
  void folderName;
  return added;
}

// ---------- Public API ----------

/**
 * Force-assign an unmatched folder to a specific IGDB game (user override).
 */
export async function matchUnmatchedFolder(
  rootFolderId: string,
  folderName: string,
  igdbId: number
): Promise<{ gameId: string; filesAdded: number }> {
  const rootFolder = await storage.getRootFolder(rootFolderId);
  if (!rootFolder) throw new Error("Root folder not found");

  const absolutePath = path.join(rootFolder.path, folderName);
  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isDirectory()) throw new Error("Folder does not exist");

  // Fetch IGDB entry
  const candidates = await igdbClient.searchGames(folderName, 10);
  const igdb = candidates.find((c) => c.id === igdbId);
  if (!igdb) throw new Error("Selected IGDB game not found in top candidates");

  let game = await storage.getGameByIgdbId(igdbId);
  if (!game) {
    game = await storage.addGame(igdbToInsertGame(igdb));
  } else if (game.status !== "owned") {
    await storage.updateGameStatus(game.id, { status: "owned" });
  }

  const files = await listFiles(absolutePath);
  const filesAdded = await assignFilesToGame(
    game.id,
    rootFolder.id,
    rootFolder.path,
    folderName,
    files
  );

  clearUnmatched(rootFolderId, folderName);
  return { gameId: game.id, filesAdded };
}

/**
 * Scan a single root folder. Runs async; progress/unmatched state is available
 * via `getScanProgress` and `getAllUnmatched`.
 */
export async function scanRootFolderById(rootFolderId: string): Promise<void> {
  const rootFolder = await storage.getRootFolder(rootFolderId);
  if (!rootFolder) throw new Error("Root folder not found");
  if (!rootFolder.enabled) {
    igdbLogger.info({ rootFolderId }, "Skipping scan: root folder is disabled");
    return;
  }

  const progress: ScanProgress = {
    rootFolderId,
    rootFolderPath: rootFolder.path,
    startedAt: new Date().toISOString(),
    status: "running",
    totalCandidates: 0,
    processedCandidates: 0,
    matched: 0,
    unmatched: 0,
    errors: 0,
  };
  progressByFolder.set(rootFolderId, progress);
  unmatchedByFolder.set(rootFolderId, []);
  emitProgress(progress);

  try {
    const candidates = await listCandidates(rootFolder.path);
    progress.totalCandidates = candidates.length;
    emitProgress(progress);

    for (const cand of candidates) {
      progress.currentCandidate = cand.folderName;
      emitProgress(progress);
      try {
        const files = await listFiles(cand.absolutePath);
        // Skip folders with no usable files (all ignored)
        const usable = files.filter((f) => classifyFile(f.relativeTo) !== "ignore");
        if (usable.length === 0) {
          progress.processedCandidates += 1;
          emitProgress(progress);
          continue;
        }

        const { best, candidates: igdbCandidates, score } = await bestIgdbMatch(cand.folderName);
        const AUTO_MATCH_THRESHOLD = 0.85;

        if (best && score >= AUTO_MATCH_THRESHOLD) {
          // Auto-match
          let game = await storage.getGameByIgdbId(best.id);
          if (!game) {
            game = await storage.addGame(igdbToInsertGame(best));
          } else if (game.status !== "owned") {
            await storage.updateGameStatus(game.id, { status: "owned" });
          }
          await assignFilesToGame(game.id, rootFolder.id, rootFolder.path, cand.folderName, files);
          progress.matched += 1;
        } else {
          // Unmatched: record with up to 5 candidates for UI resolution
          const list = unmatchedByFolder.get(rootFolderId) ?? [];
          list.push({
            rootFolderId,
            rootFolderPath: rootFolder.path,
            folderName: cand.folderName,
            absolutePath: cand.absolutePath,
            candidates: igdbCandidates.slice(0, 5).map((c) => ({
              igdbId: c.id,
              name: c.name,
              releaseYear: c.first_release_date
                ? new Date(c.first_release_date * 1000).getUTCFullYear()
                : null,
            })),
          });
          unmatchedByFolder.set(rootFolderId, list);
          progress.unmatched += 1;
        }
      } catch (err) {
        progress.errors += 1;
        routesLogger.error({ err, folder: cand.folderName }, "scan: error processing folder");
      }
      progress.processedCandidates += 1;
      emitProgress(progress);
    }

    progress.status = "completed";
    progress.finishedAt = new Date().toISOString();
    progress.currentCandidate = undefined;
    emitProgress(progress);
  } catch (err) {
    progress.status = "failed";
    progress.finishedAt = new Date().toISOString();
    progress.errorMessage = err instanceof Error ? err.message : String(err);
    emitProgress(progress);
    routesLogger.error({ err, rootFolderId }, "library scan failed");
  }
}

export async function scanAllEnabledRootFolders(): Promise<void> {
  const folders = await storage.getEnabledRootFolders();
  for (const folder of folders) {
    await scanRootFolderById(folder.id);
  }
}

// Expose the matcher so tests can cover it independently
export const __testing = { scoreMatch, classifyFile };
