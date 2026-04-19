// Gamearr: post-download import pipeline (#4). Moves/hardlinks files from the
// downloader's save path into the appropriate root folder with proper naming —
// the equivalent of Sonarr/Radarr's post-processing.
//
// Flow:
//   cron.checkDownloadStatus() detects a completion ->
//   processCompletedDownload(gameDownloadId) ->
//     1. resolve source path via the downloader client
//     2. pick target root folder (largest free space among enabled+accessible)
//     3. planImport() -> ImportPlan (source -> dest pairs + rename)
//     4. executeImport(plan, strategy) -> filesystem operations with fallbacks
//     5. register files in `game_files` and flip the game to `owned`
//
// Strategy semantics:
//   - `hardlink`: zero-copy link on the same FS (ideal for seedboxes).
//                 Falls back to `copy` on cross-filesystem (EXDEV).
//   - `move`:     rename first; falls back to copy+unlink if rename fails
//                 (e.g. cross-device).
//   - `copy`:     plain copy, leaves the source untouched.
//   - `symlink`:  symbolic link (source path must remain online).

import fs from "fs";
import path from "path";
import { storage } from "./storage.js";
import { DownloaderManager } from "./downloaders.js";
import { igdbLogger, routesLogger } from "./logger.js";
import { cleanReleaseName } from "../shared/title-utils.js";
import { classifyFile } from "./library-scanner.js";
import type {
  Game,
  ImportStrategy,
  ImportTask,
  RootFolder,
  Downloader,
  InsertGameFile,
} from "../shared/schema.js";

// ---------- Types ----------

export interface ImportFilePlan {
  sourceAbsolute: string;
  targetRelative: string; // relative to the root folder
  sizeBytes: number;
}

export interface ImportPlan {
  rootFolder: RootFolder;
  targetDirRelative: string; // the destination directory (relative to root)
  files: ImportFilePlan[];
}

// Strip characters that aren't portable across Windows/NTFS and POSIX
// filesystems. The leading `\x00-\x1f` range covers C0 control chars — we
// mean to match them literally, so the `no-control-regex` lint is silenced.
// eslint-disable-next-line no-control-regex
const SAFE_CHARS = /[<>:"|?*\x00-\x1f]/g;

// ---------- Naming ----------

/**
 * Render a destination folder name for a game. When `naming_templates` (#5)
 * lands, this function will consult the template engine — for now we apply
 * a fixed `{Title} ({Year})` template (or just the cleaned title if no year).
 */
export function renderGameFolderName(game: Game): string {
  const title = (game.title || "Unknown").replace(SAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  if (year && !Number.isNaN(year)) return `${title} (${year})`;
  return title;
}

// ---------- Source discovery ----------

/**
 * Ask the downloader client for the on-disk location of a completed download.
 * Falls back to the downloader's configured `downloadPath` if the client
 * doesn't surface a per-torrent path.
 */
async function resolveSourcePath(
  downloader: Downloader,
  downloadHash: string,
  downloadTitle: string
): Promise<string | null> {
  try {
    const details = await DownloaderManager.getDownloadDetails(downloader, downloadHash);
    if (details?.downloadDir) {
      // qBittorrent/Transmission expose the directory that contains the payload.
      // When the torrent is a single file/folder, the actual import source is
      // `<downloadDir>/<title>`. Prefer that if it exists; otherwise keep the
      // directory itself.
      const combined = path.join(details.downloadDir, downloadTitle);
      try {
        await fs.promises.access(combined);
        return combined;
      } catch {
        return details.downloadDir;
      }
    }
  } catch (err) {
    igdbLogger.warn({ err, downloadHash }, "import: failed to fetch download details");
  }

  if (downloader.downloadPath) {
    const combined = path.join(downloader.downloadPath, downloadTitle);
    try {
      await fs.promises.access(combined);
      return combined;
    } catch {
      return downloader.downloadPath;
    }
  }

  return null;
}

// ---------- Target selection ----------

/**
 * Pick the best root folder for an import. Preference order:
 *   1. The one the user already stores this game under (if any).
 *   2. The accessible+enabled root folder with the most free space.
 */
async function pickTargetRootFolder(gameId: string): Promise<RootFolder | null> {
  const existingFiles = await storage.getGameFiles(gameId);
  for (const f of existingFiles) {
    if (f.rootFolderId) {
      const rf = await storage.getRootFolder(f.rootFolderId);
      if (rf && rf.enabled && rf.accessible) return rf;
    }
  }

  const candidates = await storage.getEnabledRootFolders();
  const usable = candidates.filter((rf) => rf.accessible);
  if (usable.length === 0) return candidates[0] ?? null;
  usable.sort((a, b) => (b.diskFreeBytes ?? 0) - (a.diskFreeBytes ?? 0));
  return usable[0];
}

// ---------- Planning ----------

async function listFilesRecursively(
  root: string,
  maxDepth = 4
): Promise<Array<{ absolute: string; sizeBytes: number }>> {
  const out: Array<{ absolute: string; sizeBytes: number }> = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(abs);
          out.push({ absolute: abs, sizeBytes: stat.size });
        } catch {
          // unreadable -> skip
        }
      }
    }
  }

  const stat = await fs.promises.stat(root);
  if (stat.isFile()) {
    out.push({ absolute: root, sizeBytes: stat.size });
    return out;
  }
  await walk(root, 0);
  return out;
}

/**
 * Compute source -> target mappings for an import. Files that are "ignored"
 * (nfo, md5, url, thumbs, ...) are dropped.
 */
export async function planImport(
  sourcePath: string,
  game: Game,
  rootFolder: RootFolder
): Promise<ImportPlan> {
  const targetDirRelative = renderGameFolderName(game);
  const files = await listFilesRecursively(sourcePath);

  const sourceStat = await fs.promises.stat(sourcePath);
  const sourceRoot = sourceStat.isDirectory() ? sourcePath : path.dirname(sourcePath);

  const plan: ImportFilePlan[] = [];
  for (const f of files) {
    if (classifyFile(f.absolute) === "ignore") continue;

    let relativeToSource: string;
    if (sourceStat.isFile()) {
      // Flat import of a single file: keep only the basename.
      relativeToSource = path.basename(f.absolute);
    } else {
      relativeToSource = path.relative(sourceRoot, f.absolute);
    }

    plan.push({
      sourceAbsolute: f.absolute,
      targetRelative: path.join(targetDirRelative, relativeToSource),
      sizeBytes: f.sizeBytes,
    });
  }

  return { rootFolder, targetDirRelative, files: plan };
}

// ---------- Execution ----------

function isCrossDeviceError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EXDEV" || code === "ENOTSUP";
}

async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function copyFileAtomic(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  const tmp = `${dest}.importing-${process.pid}-${Date.now()}`;
  try {
    await fs.promises.copyFile(src, tmp);
    await fs.promises.rename(tmp, dest);
  } catch (err) {
    // Best-effort cleanup of the partial file
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function applyOperation(
  src: string,
  dest: string,
  strategy: ImportStrategy
): Promise<ImportStrategy> {
  await ensureDir(path.dirname(dest));

  if (strategy === "hardlink") {
    try {
      await fs.promises.link(src, dest);
      return "hardlink";
    } catch (err) {
      if (isCrossDeviceError(err)) {
        // Fall back to copy — the file just can't be hardlinked across devices.
        igdbLogger.info(
          { src, dest },
          "import: hardlink impossible across filesystems, falling back to copy"
        );
        await copyFileAtomic(src, dest);
        return "copy";
      }
      throw err;
    }
  }

  if (strategy === "symlink") {
    try {
      await fs.promises.symlink(src, dest);
      return "symlink";
    } catch (err) {
      igdbLogger.warn({ err, src, dest }, "import: symlink failed, falling back to copy");
      await copyFileAtomic(src, dest);
      return "copy";
    }
  }

  if (strategy === "move") {
    try {
      await fs.promises.rename(src, dest);
      return "move";
    } catch (err) {
      if (isCrossDeviceError(err)) {
        igdbLogger.info({ src, dest }, "import: rename crosses devices, copy+unlink fallback");
        await copyFileAtomic(src, dest);
        await fs.promises.unlink(src);
        return "move";
      }
      throw err;
    }
  }

  // strategy === "copy"
  await copyFileAtomic(src, dest);
  return "copy";
}

/**
 * Materialize the plan on disk. Returns the list of destination paths for
 * each file that was actually imported (some may be skipped if they already
 * exist at destination with matching size).
 */
export async function executeImport(
  plan: ImportPlan,
  strategy: ImportStrategy
): Promise<Array<{ targetRelative: string; sizeBytes: number }>> {
  const done: Array<{ targetRelative: string; sizeBytes: number }> = [];
  const rootPath = plan.rootFolder.path;

  for (const entry of plan.files) {
    const destAbsolute = path.resolve(rootPath, entry.targetRelative);
    const rootResolved = path.resolve(rootPath);
    const rel = path.relative(rootResolved, destAbsolute);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Refusing to import outside root folder: ${entry.targetRelative}`);
    }

    try {
      const existing = await fs.promises.stat(destAbsolute);
      if (existing.isFile() && existing.size === entry.sizeBytes) {
        // Already present, skip.
        done.push({ targetRelative: entry.targetRelative, sizeBytes: entry.sizeBytes });
        continue;
      }
    } catch {
      /* not yet present, proceed */
    }

    await applyOperation(entry.sourceAbsolute, destAbsolute, strategy);
    done.push({ targetRelative: entry.targetRelative, sizeBytes: entry.sizeBytes });
  }

  return done;
}

// ---------- Orchestrator ----------

async function registerImportedFiles(
  gameId: string,
  rootFolder: RootFolder,
  imported: Array<{ targetRelative: string; sizeBytes: number }>
): Promise<number> {
  const existing = await storage.getGameFiles(gameId);
  const existingPaths = new Set(existing.map((f) => f.relativePath));

  let added = 0;
  for (const f of imported) {
    if (existingPaths.has(f.targetRelative)) continue;
    const fileType = classifyFile(f.targetRelative);
    if (fileType === "ignore") continue;
    const insert: InsertGameFile = {
      gameId,
      rootFolderId: rootFolder.id,
      relativePath: f.targetRelative,
      sizeBytes: f.sizeBytes,
      fileType,
      checksumSha1: null,
    };
    await storage.addGameFile(insert);
    added += 1;
  }
  return added;
}

/**
 * Main entry point. Called async from the cron loop when a download flips
 * to `completed`. Returns the final import_task row so callers can surface it.
 */
export async function processCompletedDownload(
  gameDownloadId: string,
  overrides?: { strategy?: ImportStrategy; rootFolderId?: string; taskId?: string }
): Promise<ImportTask> {
  const gameDownload = await storage.getGameDownload(gameDownloadId);
  if (!gameDownload) throw new Error(`game_download ${gameDownloadId} not found`);

  const [game, downloader] = await Promise.all([
    storage.getGame(gameDownload.gameId),
    storage.getDownloader(gameDownload.downloaderId),
  ]);
  if (!game) throw new Error(`game ${gameDownload.gameId} not found`);
  if (!downloader) throw new Error(`downloader ${gameDownload.downloaderId} not found`);

  const strategy: ImportStrategy =
    overrides?.strategy ??
    (downloader.defaultImportStrategy as ImportStrategy | undefined) ??
    "move";

  const sourcePath = await resolveSourcePath(
    downloader,
    gameDownload.downloadHash,
    gameDownload.downloadTitle
  );

  let rootFolder: RootFolder | null = null;
  if (overrides?.rootFolderId) {
    rootFolder = (await storage.getRootFolder(overrides.rootFolderId)) ?? null;
  } else {
    rootFolder = await pickTargetRootFolder(game.id);
  }

  // Targetting preview: use cleaned release name as fallback dest when the game
  // title is empty (shouldn't happen in practice, but keeps the row useful).
  const previewTargetRelative = game.title
    ? renderGameFolderName(game)
    : cleanReleaseName(gameDownload.downloadTitle);

  const task = overrides?.taskId
    ? await storage.getImportTask(overrides.taskId)
    : await storage.addImportTask({
        gameDownloadId,
        status: "pending",
        strategy,
        sourcePath: sourcePath ?? "",
        targetRootFolderId: rootFolder?.id ?? null,
        targetRelativePath: previewTargetRelative,
        errorMessage: null,
      });
  if (!task) throw new Error("import_task could not be created");

  const fail = async (msg: string): Promise<ImportTask> => {
    const updated = await storage.updateImportTask(task.id, {
      status: "failed",
      errorMessage: msg,
    });
    return updated ?? { ...task, status: "failed", errorMessage: msg };
  };

  if (!sourcePath) {
    routesLogger.warn({ gameDownloadId }, "import: cannot resolve source path");
    return fail("Could not resolve the download's source path on disk");
  }
  if (!rootFolder) {
    return fail("No enabled + accessible root folder is configured");
  }

  await storage.updateImportTask(task.id, {
    status: "in_progress",
    strategy,
    sourcePath,
    targetRootFolderId: rootFolder.id,
  });

  try {
    const plan = await planImport(sourcePath, game, rootFolder);
    if (plan.files.length === 0) {
      return fail("Source contains no importable files");
    }

    const imported = await executeImport(plan, strategy);
    const addedFiles = await registerImportedFiles(game.id, rootFolder, imported);

    // Game becomes `owned` only after a successful import.
    if (game.status !== "owned") {
      await storage.updateGameStatus(game.id, { status: "owned" });
    }

    const updated = await storage.updateImportTask(task.id, {
      status: "completed",
      targetRelativePath: plan.targetDirRelative,
      errorMessage: null,
    });

    igdbLogger.info(
      { gameId: game.id, rootFolderId: rootFolder.id, addedFiles, strategy },
      "import: completed"
    );

    return updated ?? task;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    routesLogger.error({ err, gameDownloadId }, "import: execution failed");
    return fail(msg);
  }
}

export const __testing = { renderGameFolderName, planImport };
