/**
 * Inline icon set (Lucide-style paths), ported verbatim from the design.
 * Kept inline rather than pulled from a package so slide art and app chrome
 * never depend on an external request at render time.
 */

import type { SVGProps } from "react";

type PathSpec = [string, Record<string, string | number>];

export const ICON_PATHS: Record<string, PathSpec[]> = {
  sparkles: [
    [
      "path",
      {
        d: "M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z",
      },
    ],
    ["path", { d: "M20 3v4" }],
    ["path", { d: "M22 5h-4" }],
  ],
  dash: [
    ["rect", { width: 7, height: 9, x: 3, y: 3, rx: 1 }],
    ["rect", { width: 7, height: 5, x: 14, y: 3, rx: 1 }],
    ["rect", { width: 7, height: 9, x: 14, y: 12, rx: 1 }],
    ["rect", { width: 7, height: 5, x: 3, y: 16, rx: 1 }],
  ],
  layers: [
    ["path", { d: "M12 2 2 7l10 5 10-5-10-5Z" }],
    ["path", { d: "m2 17 10 5 10-5" }],
    ["path", { d: "m2 12 10 5 10-5" }],
  ],
  cal: [
    ["path", { d: "M8 2v4" }],
    ["path", { d: "M16 2v4" }],
    ["rect", { width: 18, height: 18, x: 3, y: 4, rx: 2 }],
    ["path", { d: "M3 10h18" }],
  ],
  sliders: [
    ["line", { x1: 21, x2: 14, y1: 4, y2: 4 }],
    ["line", { x1: 10, x2: 3, y1: 4, y2: 4 }],
    ["line", { x1: 21, x2: 12, y1: 12, y2: 12 }],
    ["line", { x1: 8, x2: 3, y1: 12, y2: 12 }],
    ["line", { x1: 21, x2: 16, y1: 20, y2: 20 }],
    ["line", { x1: 12, x2: 3, y1: 20, y2: 20 }],
    ["line", { x1: 14, x2: 14, y1: 2, y2: 6 }],
    ["line", { x1: 8, x2: 8, y1: 10, y2: 14 }],
    ["line", { x1: 16, x2: 16, y1: 18, y2: 22 }],
  ],
  ig: [
    ["rect", { width: 20, height: 20, x: 2, y: 2, rx: 5.5 }],
    ["circle", { cx: 12, cy: 12, r: 4 }],
    ["line", { x1: 17.5, x2: 17.51, y1: 6.5, y2: 6.5 }],
  ],
  fb: [["path", { d: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" }]],
  yt: [
    [
      "path",
      {
        d: "M2.5 17a24 24 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24 24 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17",
      },
    ],
    ["path", { d: "m10 15 5-3-5-3z" }],
  ],
  tt: [["path", { d: "M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" }]],
  in: [
    ["path", { d: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" }],
    ["rect", { width: 4, height: 12, x: 2, y: 9 }],
    ["circle", { cx: 4, cy: 4, r: 2 }],
  ],
  xt: [
    ["path", { d: "M4 4l16 16" }],
    ["path", { d: "M20 4 4 20" }],
  ],
  close: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  check: [["polyline", { points: "20 6 9 17 4 12" }]],
  chevL: [["path", { d: "m15 18-6-6 6-6" }]],
  chevR: [["path", { d: "m9 18 6-6-6-6" }]],
  arrowR: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "m12 5 7 7-7 7" }],
  ],
  plus: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "M12 5v14" }],
  ],
  refresh: [
    ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }],
    ["path", { d: "M21 3v5h-5" }],
    ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }],
    ["path", { d: "M8 16H3v5" }],
  ],
  image: [
    ["rect", { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
    ["circle", { cx: 9, cy: 9, r: 2 }],
    ["path", { d: "m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" }],
  ],
  film: [
    ["rect", { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
    ["path", { d: "M7 3v18" }],
    ["path", { d: "M3 7.5h4" }],
    ["path", { d: "M3 12h18" }],
    ["path", { d: "M3 16.5h4" }],
    ["path", { d: "M17 3v18" }],
    ["path", { d: "M17 7.5h4" }],
    ["path", { d: "M17 16.5h4" }],
  ],
  book: [
    ["path", { d: "M12 7v14" }],
    [
      "path",
      {
        d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
      },
    ],
  ],
  story: [
    ["circle", { cx: 12, cy: 12, r: 9, strokeDasharray: "3 3" }],
    ["circle", { cx: 12, cy: 12, r: 3.5 }],
  ],
  photo: [
    ["rect", { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
    ["circle", { cx: 8.5, cy: 8.5, r: 1.5 }],
    ["path", { d: "m21 15-4.35-4.35a2 2 0 0 0-2.8 0L4 21" }],
  ],
  clock: [
    ["circle", { cx: 12, cy: 12, r: 9 }],
    ["polyline", { points: "12 7 12 12 15.5 14" }],
  ],
  heart: [
    [
      "path",
      { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" },
    ],
  ],
  comment: [["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }]],
  send: [
    ["path", { d: "m22 2-7 20-4-9-9-4Z" }],
    ["path", { d: "M22 2 11 13" }],
  ],
  save: [["path", { d: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }]],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
  ],
  wand: [
    [
      "path",
      { d: "m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.66a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" },
    ],
    ["path", { d: "m14 7 3 3" }],
    ["path", { d: "M5 6v4" }],
    ["path", { d: "M19 14v4" }],
    ["path", { d: "M3 8h4" }],
    ["path", { d: "M17 16h4" }],
  ],
  trash: [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }],
  ],
  play: [["polygon", { points: "6 3 20 12 6 21 6 3" }]],
  pause: [
    ["rect", { width: 4, height: 16, x: 6, y: 4, rx: 1 }],
    ["rect", { width: 4, height: 16, x: 14, y: 4, rx: 1 }],
  ],
  wave: [
    ["path", { d: "M2 13v-2" }],
    ["path", { d: "M6 17V7" }],
    ["path", { d: "M10 20V4" }],
    ["path", { d: "M14 17V7" }],
    ["path", { d: "M18 15V9" }],
    ["path", { d: "M22 13v-2" }],
  ],
  info: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],
  plug: [
    ["path", { d: "M12 22v-5" }],
    ["path", { d: "M9 8V2" }],
    ["path", { d: "M15 8V2" }],
    ["path", { d: "M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" }],
  ],
  card: [
    ["rect", { width: 20, height: 14, x: 2, y: 5, rx: 2 }],
    ["line", { x1: 2, x2: 22, y1: 10, y2: 10 }],
  ],
  shield: [
    [
      "path",
      { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" },
    ],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
  eye: [
    ["path", { d: "M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" }],
    ["circle", { cx: 12, cy: 12, r: 3 }],
  ],
  upload: [
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
    ["polyline", { points: "17 8 12 3 7 8" }],
    ["line", { x1: 12, x2: 12, y1: 3, y2: 15 }],
  ],
};

export type IconName = keyof typeof ICON_PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: string;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, strokeWidth = 2, style, ...rest }: IconProps) {
  const paths = ICON_PATHS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-hidden="true"
      {...rest}
    >
      {paths.map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return <Tag key={i} {...attrs} />;
      })}
    </svg>
  );
}

/** Platform → display name + icon, matching the design's PLAT map. */
export const PLATFORMS: Record<string, { name: string; icon: string }> = {
  instagram: { name: "Instagram", icon: "ig" },
  facebook: { name: "Facebook", icon: "fb" },
  tiktok: { name: "TikTok", icon: "tt" },
  youtube: { name: "YouTube", icon: "yt" },
  linkedin: { name: "LinkedIn", icon: "in" },
  x: { name: "X", icon: "xt" },
};
