// Gamearr: root folders health + disk stats helpers.
// Kept separate so cron jobs and HTTP handlers share the same logic.

import fs from "fs";
import path from "path";
import { promisify } from "util";
import { storage } from "./storage.js";
import { routesLogger } from "./logger.js";

const statfsAsync = (fs as unknown as { statfs?: typeof fs.statfs }).statfs
  ? promisify((fs as unknown as { statfs: typeof fs.statfs }).statfs.bind(fs))
  : null;

export interface RootFolderHealth {
  accessible: boolean;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  error?: string;
}

/**
 * Inspect a path on disk.
 * - `accessible` true iff the path exists, is a directory, and is writable.
 * - Disk stats are best-effort: uses fs.statfs when available (Node 18.15+),
 *   otherwise returns nulls (we don't want to block on unsupported platforms).
 */
export async function probeRootFolder(folderPath: string): Promise<RootFolderHealth> {
  try {
    const resolved = path.resolve(folderPath);
    const stat = await fs.promises.stat(resolved);
    if (!stat.isDirectory()) {
      return {
        accessible: false,
        diskFreeBytes: null,
        diskTotalBytes: null,
        error: "Path exists but is not a directory",
      };
    }

    // Writability probe
    await fs.promises.access(resolved, fs.constants.W_OK);

    // Disk stats (best effort)
    let diskFreeBytes: number | null = null;
    let diskTotalBytes: number | null = null;
    if (statfsAsync) {
      try {
        const s = (await statfsAsync(resolved)) as {
          bsize: number;
          bavail: number;
          blocks: number;
        };
        diskFreeBytes = Number(s.bavail) * Number(s.bsize);
        diskTotalBytes = Number(s.blocks) * Number(s.bsize);
      } catch (err) {
        routesLogger.debug({ err, folderPath }, "statfs failed, returning null disk stats");
      }
    }

    return { accessible: true, diskFreeBytes, diskTotalBytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      accessible: false,
      diskFreeBytes: null,
      diskTotalBytes: null,
      error: message,
    };
  }
}

/**
 * Refresh health stats for every root folder in the DB.
 * Used by the cron job and by the manual "health check" endpoint.
 */
export async function refreshAllRootFoldersHealth(): Promise<void> {
  const folders = await storage.getAllRootFolders();
  for (const folder of folders) {
    const health = await probeRootFolder(folder.path);
    await storage.updateRootFolderHealth(folder.id, {
      accessible: health.accessible,
      diskFreeBytes: health.diskFreeBytes,
      diskTotalBytes: health.diskTotalBytes,
    });
  }
}
