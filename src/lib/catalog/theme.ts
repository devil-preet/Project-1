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

export interface ThemeVars {
  [key: string]: string;
}

/** CSS custom properties for the storefront (inputs are already validated as hex by the public service). */
export function storefrontVars(t: { primary: string; secondary: string; accent: string; background: string }): ThemeVars {
  return {
    "--sf-bg": t.background,
    "--sf-fg": readableOn(t.background),
    "--sf-primary": t.primary,
    "--sf-primary-fg": readableOn(t.primary),
    "--sf-accent": t.accent,
    "--sf-accent-fg": readableOn(t.accent),
    "--sf-secondary": t.secondary,
  };
}
