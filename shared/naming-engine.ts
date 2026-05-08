export const DEFAULT_FOLDER_TEMPLATE = "{Title} ({Year})";
export const DEFAULT_FILE_TEMPLATE = "{Title} ({Year}) [{Group}]";

export interface GameContext {
  title: string;
  year: number | null;
  platform?: string;
  version?: string;
  group?: string;
  source?: string;
}

export interface PreviewResult {
  input: GameContext;
  output: string;
}

function titleThe(title: string): string {
  return /^the\s+/i.test(title) ? title.replace(/^the\s+/i, "") + ", The" : title;
}

export function renderTemplate(template: string, ctx: GameContext): string {
  const vars: Record<string, string> = {
    Title: ctx.title ?? "",
    TitleThe: titleThe(ctx.title ?? ""),
    Year: ctx.year != null ? String(ctx.year) : "",
    Platform: ctx.platform ?? "",
    Version: ctx.version ?? "",
    Group: ctx.group ?? "",
    Source: ctx.source ?? "",
    Edition: "",
    Quality: "",
  };

  let result = template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? vars[key] : match
  );

  // Remove empty () and [] pairs
  result = result.replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "");

  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, " ");

  // Trim leading and trailing spaces and special characters
  result = result.replace(/^[\s\-_.]+|[\s\-_.]+$/g, "");

  return result;
}

// eslint-disable-next-line no-control-regex
const WIN_ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/g;
const WIN_TRAILING = /[. ]+$/;

export function sanitizeFilename(name: string, os: "windows" | "posix"): string {
  let s = name;
  if (os === "windows") {
    s = s.replace(WIN_ILLEGAL, "").replace(WIN_TRAILING, "");
  } else {
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[/\x00]/g, "");
  }
  return s.slice(0, 200);
}

export function previewAll(template: string, samples: GameContext[]): PreviewResult[] {
  return samples.map((input) => ({
    input,
    output: sanitizeFilename(renderTemplate(template, input), "windows"),
  }));
}
