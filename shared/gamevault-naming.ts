/**
 * GameVault naming convention parser & renderer.
 *
 * Spec: https://gamevau.lt/docs/server-docs/structure
 *
 *   `Title (Version) (EarlyAccess) (GameType) (NoCache) (ReleaseYear).extension`
 *
 * Rules applied here:
 * - Round brackets `(...)` carry STRUCTURED metadata (version, EA, type,
 *   NC, year). Each token has an unambiguous marker:
 *     * Version: leading lowercase `v` then a version-ish string, e.g. `(v1.5.0)`
 *     * Build variant: `(Build 12345)`
 *     * EarlyAccess: exactly `(EA)`
 *     * GameType: `(W_P)`, `(L_SW)`, `(W_SW_C)` (letters + underscores, all caps)
 *     * NoCache: exactly `(NC)`
 *     * ReleaseYear: 4 digits between `(1900, current_year + 5)`
 * - Square brackets `[...]` are FREE-FORM tags (GOTY, REPACK, GOG, etc.).
 *   They are preserved as an ordered array.
 * - Anything that does not match any of the structured patterns is part
 *   of the Title.
 * - Extension is the final segment after the last dot — chained extensions
 *   (`.tar.gz`) keep only `.gz` per spec.
 *
 * This module is SSR-safe (pure strings, no fs).
 */

export interface ParsedGameVault {
  /** Original filename as received */
  raw: string;
  /** Cleaned title, trimmed, without parens/brackets metadata */
  title: string;
  /** Full version string without the leading 'v' when present, else null */
  version: string | null;
  /** `(Build 12345)` build identifier when present, else null */
  build: string | null;
  /** true if `(EA)` tag was found */
  earlyAccess: boolean;
  /** GameType code like 'W_P', 'L_SW', or null */
  gameType: string | null;
  /** true if `(NC)` tag was found */
  noCache: boolean;
  /** 4-digit year if found, else null */
  releaseYear: number | null;
  /** Free-form tags found in square brackets, in document order */
  tags: string[];
  /** File extension (without the leading dot), lowercase, or null for extensionless */
  extension: string | null;
}

const VERSION_RE = /^v[\d][\w.-]*$/i;
const BUILD_RE = /^Build\s+[\w.-]+$/i;
const EA_RE = /^EA$/;
const NC_RE = /^NC$/;
// GameType: at least two letters-or-underscore groups separated by underscores,
// e.g. W_P, L_SW, W_SW_C. All-uppercase letters only (to avoid clashing with words).
const GAMETYPE_RE = /^[A-Z]{1,3}(?:_[A-Z]{1,3})+$/;
const YEAR_RE = /^(19\d{2}|20\d{2}|21\d{2})$/;

// Extract balanced (...) and [...] groups from the front-to-back, ignoring
// those that appear inside the title body — GameVault tokens sit at the end
// of the name before the extension. We scan right-to-left and pop known
// patterns until we hit one that does not match (that's where the title ends).
export function parseGameVaultFilename(input: string): ParsedGameVault {
  const raw = input;
  let base = raw;
  let extension: string | null = null;
  // Extension = last dot-delimited segment iff it looks like a real ext:
  // short (<= 8 chars), only [a-z0-9] when lowercased, no brackets/spaces,
  // and NOT version-like (all-digit). `(v1.5.0) (2021)` must leave base intact.
  const lastDot = raw.lastIndexOf(".");
  if (lastDot > 0 && lastDot < raw.length - 1) {
    const candidate = raw.slice(lastDot + 1);
    const lowered = candidate.toLowerCase();
    const looksLikeExt =
      candidate.length <= 8 && /^[a-z0-9]+$/.test(lowered) && !/^\d+$/.test(candidate); // reject pure-numeric (e.g. minor version)
    if (looksLikeExt) {
      extension = lowered;
      base = raw.slice(0, lastDot);
    }
  }

  const tags: string[] = [];
  let version: string | null = null;
  let build: string | null = null;
  let earlyAccess = false;
  let gameType: string | null = null;
  let noCache = false;
  let releaseYear: number | null = null;

  // Iterate tokens from the end of the base name. A token is the substring
  // enclosed in a matching pair of brackets at the current rightmost position.
  // We stop once the rightmost non-space character is not a closing bracket.
  let remaining = base.trimEnd();
  // Safety cap to avoid worst-case loops on pathological inputs
  let iterations = 0;
  while (iterations < 16) {
    iterations += 1;
    remaining = remaining.trimEnd();
    if (remaining.length === 0) break;
    const lastChar = remaining.charAt(remaining.length - 1);

    if (lastChar === ")") {
      const openIdx = remaining.lastIndexOf("(");
      if (openIdx === -1) break;
      const inner = remaining.slice(openIdx + 1, -1).trim();
      if (inner.length === 0) break;

      if (VERSION_RE.test(inner)) {
        if (!version) version = inner.replace(/^v/i, "");
        remaining = remaining.slice(0, openIdx);
        continue;
      }
      if (BUILD_RE.test(inner)) {
        if (!build) build = inner;
        remaining = remaining.slice(0, openIdx);
        continue;
      }
      if (EA_RE.test(inner)) {
        earlyAccess = true;
        remaining = remaining.slice(0, openIdx);
        continue;
      }
      if (NC_RE.test(inner)) {
        noCache = true;
        remaining = remaining.slice(0, openIdx);
        continue;
      }
      if (GAMETYPE_RE.test(inner)) {
        if (!gameType) gameType = inner;
        remaining = remaining.slice(0, openIdx);
        continue;
      }
      if (YEAR_RE.test(inner)) {
        const y = Number(inner);
        // Allow up to 5 years in the future for pre-release games
        if (y >= 1900 && y <= new Date().getFullYear() + 5) {
          if (releaseYear === null) releaseYear = y;
          remaining = remaining.slice(0, openIdx);
          continue;
        }
      }
      // Not a structured token — stop consuming; the title carries this group too
      break;
    }

    if (lastChar === "]") {
      const openIdx = remaining.lastIndexOf("[");
      if (openIdx === -1) break;
      const inner = remaining.slice(openIdx + 1, -1).trim();
      if (inner.length === 0) {
        remaining = remaining.slice(0, openIdx);
        continue;
      }
      // Tags are pushed in reverse order then reversed at the end for stable doc order
      tags.push(inner);
      remaining = remaining.slice(0, openIdx);
      continue;
    }

    // Non-bracket trailing char → end of metadata region
    break;
  }

  const title = remaining.trim();
  tags.reverse();

  return {
    raw,
    title,
    version,
    build,
    earlyAccess,
    gameType,
    noCache,
    releaseYear,
    tags,
    extension,
  };
}

/**
 * Render a ParsedGameVault back to a GameVault-compliant filename.
 * Used by the Phase-2 naming engine so that post-import files land already
 * conformant to GameVault's spec.
 */
export function renderGameVaultFilename(parsed: Partial<ParsedGameVault>): string {
  if (!parsed.title) throw new Error("title is required to render a GameVault filename");
  const parts: string[] = [parsed.title.trim()];
  if (parsed.version) parts.push(`(v${parsed.version})`);
  if (parsed.build) parts.push(`(${parsed.build})`);
  if (parsed.earlyAccess) parts.push("(EA)");
  if (parsed.gameType) parts.push(`(${parsed.gameType})`);
  if (parsed.noCache) parts.push("(NC)");
  if (parsed.releaseYear) parts.push(`(${parsed.releaseYear})`);
  if (parsed.tags && parsed.tags.length > 0) {
    for (const t of parsed.tags) parts.push(`[${t}]`);
  }
  const body = parts.join(" ");
  if (!parsed.extension) return body;
  return `${body}.${parsed.extension.toLowerCase()}`;
}

/**
 * Sanitize a filename to comply with GameVault's character restrictions
 * (no `/`, `<`, `>`, `:`, `"`, `\`, `|`, `?`, `*`, no trailing spaces/dots).
 * Also rejects reserved Windows names (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
 */
const RESERVED = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

export function sanitizeGameVaultFilename(input: string): string {
  let out = input.replace(/[/<>:"\\|?*]/g, "");
  out = out.replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim();
  const rootName = out.split(".")[0].toUpperCase();
  if (RESERVED.has(rootName)) out = `_${out}`;
  return out;
}
