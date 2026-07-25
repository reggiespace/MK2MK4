/**
 * Slide grounds and the accent guardrail.
 *
 * Shared by the renderer, the wizard and the export service — no server-only
 * imports here, this must run in the browser and in the render route alike.
 */

import type { Ground } from "./types";

export interface GroundStyle {
  /** CSS background for the slide root. */
  bg: string;
  /** Foreground text color. */
  fg: string;
  /** Flat base color used for contrast math (gradients can't be measured). */
  base: string;
  /** Secondary/subdued text color, where the ground defines one. */
  sub?: string;
}

export const GROUNDS: Record<Ground, GroundStyle> = {
  dark: {
    bg: "radial-gradient(120% 90% at 50% 0%,#20293a 0%,#141a24 62%)",
    fg: "#f4efe0",
    base: "#141a24",
  },
  light: { bg: "#ece6d6", fg: "#1a2230", sub: "#4a4636", base: "#ece6d6" },
  primary: { bg: "#3b5a78", fg: "#f4efe0", base: "#3b5a78" },
  secondary: { bg: "#5c7556", fg: "#f4efe0", base: "#5c7556" },
  photo: { bg: "linear-gradient(150deg,#6b5f43,#2a2a20)", fg: "#f7f2e6", base: "#3a352a" },
};

export function ground(g: Ground): GroundStyle {
  return GROUNDS[g] ?? GROUNDS.light;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Fallback accents tried in order when the brand accent fails contrast. */
const FALLBACKS = ["#e7c98a", "#b89251", "#f4efe0", "#a5524a", "#141a24"];

/**
 * The accent guardrail. Returns the brand accent when it clears `min` contrast
 * against the ground, otherwise the most legible sibling. This is why any brand
 * accent is safe on any ground and nothing needs hand-tuning per slide.
 */
export function safeOn(accent: string, bg: string, min = 2.2): string {
  if (contrast(accent, bg) >= min) return accent;
  let best = FALLBACKS[0];
  let bestContrast = 0;
  for (const f of FALLBACKS) {
    const c = contrast(f, bg);
    if (c > bestContrast) {
      bestContrast = c;
      best = f;
    }
  }
  return best;
}

/** App skin tokens — the Vessel palette. */
export const TOKENS = {
  bg: "#ece6d6",
  surface: "#f4efe0",
  surface2: "#faf7ec",
  ink: "#1a2230",
  moss: "#5c7556",
  mossDark: "#4c6247",
  slate: "#3b5a78",
  brass: "#b89251",
  muted: "#6e6952",
  border: "#d9d1b6",
  border2: "#cabf9d",
} as const;

export const FONTS = {
  display: "'Spectral',Georgia,serif",
  sans: "'Albert Sans',system-ui,sans-serif",
  mono: "'IBM Plex Mono',ui-monospace,monospace",
} as const;

/** Default brand accent when an account hasn't set one. */
export const DEFAULT_ACCENT = "#5c7556";
