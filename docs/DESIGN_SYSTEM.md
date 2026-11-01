# Design system - Nova / Everloom

The UI follows the approved Nova prototype (`C:\Users\LENOVO\Downloads\nova-prototype-everloom-colors`), in its Everloom colourway. Nova is the **visual reference only**:
no prototype data, engine scripts or demo behaviour were copied. All data and behaviour come from the real application.

## Tokens (`src/app/globals.css`)
| Token | Value | Use |
|---|---|---|
| `--nv-bg` / `--background` | `#100E13` | page background (plus radial glow `#54345E` from the top right) |
| `--nv-surface` / `--card` | `#1B1720` | panels, popovers |
| `--nv-surface-2` / `--muted` / `--secondary` | `#241E2A` | secondary surfaces |
| `--nv-line` / `--border` | `#39303F` | hairlines |
| `--nv-line-strong` / `--input` | `#514557` | field and control borders |
| `--nv-ink` / `--foreground` | `#F8F3F7` | text |
| `--nv-muted` / `--muted-foreground` | `#AA9EAE` | secondary text |
| `--nv-accent` / `--primary` | `#D9B8F4` (gradient `#EAD7FA` to `#C69CE9`) | primary actions, active states |
| `--nv-ok` / `--nv-warm` / `--nv-danger` | `#86D6A0` / `#E9CDA9` / `#E58D9A` | live, draft/warning, destructive |

shadcn's semantic tokens (`--background`, `--card`, `--primary`, ...) are mapped onto these, so every existing component picks up the theme. The product UI is dark-only (`<html class="dark">`).
There is no lime, neon yellow or teal anywhere in the UI chrome.

## Typography
`next/font/google` (self-hosted at build): **Unbounded** (`font-heading`, titles, numbers), **Manrope** (`font-sans`, body), **JetBrains Mono** (`font-mono`, labels, prices, badges).

## Utilities (`@layer components`)
`.nv-bg` (aurora blobs + grid, rendered once in the root layout) · `.nv-panel` (glass panel, 22px radius) with `.nv-panel-hover`, `.nv-panel-lift`, `.nv-panel-accent` · `.nv-title` · `.nv-kicker` · `.nv-label` · `.nv-chip` · `.nv-pulse` · `.nv-rise` (staggered entrance, honours `--i`).
Motion is restrained and disabled under `prefers-reduced-motion`.

## Primitives restyled (`src/components/ui`)
Button (pill, gradient primary, glass outline) · Input / Textarea (deep field, lavender focus ring) · Badge (mono caps pill) · Dialog / AlertDialog (glass, blurred backdrop). Switch, Select, Tabs, Progress, Table inherit the tokens.

## Shell
`workspace-nav.tsx`: floating glass rail that expands on hover/focus (desktop) and becomes a bottom pill bar on phones. `b/[businessId]/layout.tsx`: sticky glass top bar with business switcher, role chip, "View store" and sign-out.
Page headers: `PageHeader` (kicker, large Unbounded title, description, actions).

## Screens
Overview (command center: status ring, stat cards, quick tiles, category bars, most-stocked, launch readiness - all computed from real data) · Products (4:5 glass cards, filters as pills) · Product form (with live storefront preview) ·
Categories · Branding (with live storefront preview) · Media · Team · Settings · Dashboard · Auth · Onboarding · Public storefront.

## Storefront
Nova structure (floating pill header, split hero with featured product and orbit glow, category marquee, 3:4 category tiles, 4:5 product cards, collection and product pages, glass footer) driven by the **business's own branding**:
- `defaultTheme: dark` renders the Everloom base; `light` renders the same layout on a light surface (`#FAF7F9`).
- The accent is the business's accent colour, adjusted by `legibleAccent()` if it would be hard to read on the chosen surface; the hero tint uses the primary colour when legible.

## Differences from the prototype (and why)
- **No simulated features.** The prototype's cart, checkout, search box, command palette (Ctrl+K), live feed, reset-demo data, media-library editor and storefront designer have no counterpart in the app, so they were not built. Overview shows only real metrics.
- **No cursor-tracking glow, 3D tilt or magnetic buttons.** The brief asks for restrained motion; hover states use border/shadow/lift only.
- **Overview "Live feed" omitted** (the app records no activity events).
- **Hero headline** is the store name (the app has no separate hero-title setting); stats/facts show only real values (currency, collection count).
- **Storefront theme** honours each business's light/dark choice and accent colour (a stored, existing feature), which the single-brand prototype did not.
- **Fonts** are loaded through `next/font` (no Google Fonts `<link>`), which keeps the strict CSP intact.
