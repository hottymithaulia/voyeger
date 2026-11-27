import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Oklch = { l: number; c: number; h: number };

function parseThemeBlock(css: string, selector: string): Record<string, Oklch> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing selector ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 1;
  let i = open + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
    i += 1;
  }
  const block = css.slice(open + 1, i - 1);
  const tokens: Record<string, Oklch> = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*oklch\(([^)]+)\)/gi)) {
    const name = match[1];
    const parts = match[2]?.trim().split(/\s+/).map(Number);
    if (!name || !parts || parts.length < 3) continue;
    tokens[name] = { l: parts[0] ?? 0, c: parts[1] ?? 0, h: parts[2] ?? 0 };
  }
  return tokens;
}

function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;
  const r = +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;
  return [
    Math.min(1, Math.max(0, r)),
    Math.min(1, Math.max(0, g)),
    Math.min(1, Math.max(0, bl)),
  ];
}

function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: Oklch, bg: Oklch): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const TOKEN_PAIRS: Array<[string, string]> = [
  ["--foreground", "--background"],
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--muted-foreground", "--muted"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--card"],
  ["--accent-foreground", "--accent"],
  ["--destructive-foreground", "--destructive"],
  ["--sidebar-foreground", "--sidebar"],
  ["--sidebar-primary-foreground", "--sidebar-primary"],
  ["--sidebar-accent-foreground", "--sidebar-accent"],
  ["--primary", "--background"],
  ["--primary", "--secondary"],
  ["--primary", "--card"],
  ["--brand-green", "--background"],
  ["--brand-green", "--card"],
  ["--background", "--category-hidden"],
  ["--background", "--category-food"],
  ["--background", "--category-culture"],
  ["--background", "--category-experience"],
];

describe("design token WCAG AA contrast (>= 4.5:1)", () => {
  const css = readFileSync(path.resolve(__dirname, "./styles.css"), "utf8");
  const light = parseThemeBlock(css, ":root {");
  const dark = parseThemeBlock(css, ".dark {");

  it("ensures every light mode foreground/background pair has contrast >= 4.5", () => {
    const failures: string[] = [];
    for (const [fg, bg] of TOKEN_PAIRS) {
      const fgTok = light[fg];
      const bgTok = light[bg];
      expect(fgTok, `missing light token ${fg}`).toBeDefined();
      expect(bgTok, `missing light token ${bg}`).toBeDefined();
      if (!fgTok || !bgTok) continue;
      const ratio = contrastRatio(fgTok, bgTok);
      if (ratio < 4.5) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  });

  it("ensures every dark mode foreground/background pair has contrast >= 4.5", () => {
    const failures: string[] = [];
    for (const [fg, bg] of TOKEN_PAIRS) {
      const fgTok = dark[fg];
      const bgTok = dark[bg];
      expect(fgTok, `missing dark token ${fg}`).toBeDefined();
      expect(bgTok, `missing dark token ${bg}`).toBeDefined();
      if (!fgTok || !bgTok) continue;
      const ratio = contrastRatio(fgTok, bgTok);
      if (ratio < 4.5) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  });
});
