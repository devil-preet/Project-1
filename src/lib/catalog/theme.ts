/** Relative luminance (WCAG) of a #RRGGBB colour, 0..1. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Black or white, whichever reads better on `bg`. */
export function readableOn(bg: string): "#111111" | "#FFFFFF" {
  return luminance(bg) > 0.35 ? "#111111" : "#FFFFFF";
}

/** Blend `hex` toward `toward` by `t` (0..1). */
export function mix(hex: string, toward: "#FFFFFF" | "#000000", t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = toward === "#FFFFFF" ? 255 : 0;
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + b * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Brand accent that stays legible on the storefront surface: on the dark Everloom base a too-dark brand colour
 * is lightened step by step; on the light variant a too-light one is darkened.
 */
export function legibleAccent(accent: string, mode: "light" | "dark"): string {
  let c = accent;
  for (let i = 0; i < 12; i++) {
    const l = luminance(c);
    if (mode === "dark" ? l >= 0.3 : l <= 0.4) return c;
    c = mix(c, mode === "dark" ? "#FFFFFF" : "#000000", 0.12);
  }
  return c;
}

export interface ThemeVars {
  [key: string]: string;
}

export interface StoreTheme {
  primary: string;
  secondary: string;
  accent: string;
  mode: "light" | "dark";
}

/**
 * CSS custom properties for the Nova storefront. Dark = the approved Everloom base (#100E13, plum glow);
 * light = the same layout on a soft light surface. The business's own colours drive the accent (and the hero
 * tint); inputs are already validated as hex by the public service.
 */
export function storefrontVars(t: StoreTheme): ThemeVars {
  const dark = t.mode === "dark";
  const accent = legibleAccent(t.accent, t.mode);
  const hero = legibleAccent(t.primary, t.mode) === t.primary ? t.primary : accent;
  return {
    "--sf-bg": dark ? "#100E13" : "#FAF7F9",
    "--sf-fg": dark ? "#F8F3F7" : "#1B1720",
    "--sf-muted": dark ? "#AA9EAE" : "#6b6171",
    "--sf-line": dark ? "#39303F" : "#E3DAE6",
    "--sf-line-strong": dark ? "#514557" : "#CBBFD0",
    "--sf-surface": dark ? "rgba(248,243,247,.045)" : "rgba(27,23,32,.04)",
    "--sf-glass": dark ? "rgba(20,17,24,.72)" : "rgba(255,255,255,.78)",
    "--sf-accent": accent,
    "--sf-accent-fg": readableOn(accent),
    "--sf-hero": hero,
    "--sf-hero-fg": readableOn(hero),
    "--sf-glow": dark ? "#54345E" : "#E9D7F5",
  };
}
