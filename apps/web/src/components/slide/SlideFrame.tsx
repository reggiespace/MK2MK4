/**
 * Scaling wrappers around `<Slide>`. The slide always draws at its manifest
 * base size; these fit it to a container without a second renderer.
 */

import type { ReactNode } from "react";
import { getManifest } from "@/lib/templates/manifests";
import type { TemplateStyleId } from "@/lib/templates/types";

/**
 * Responsive fit via an SVG `viewBox` + `foreignObject`, as the design
 * specifies — correct at any container width with no ResizeObserver, so the
 * preview can never clip.
 */
export function SlideFit({
  style,
  maxWidth,
  children,
}: {
  style: TemplateStyleId;
  maxWidth: number;
  children: ReactNode;
}) {
  const { w, h } = getManifest(style).base;
  return (
    <div style={{ width: "100%", maxWidth: `${maxWidth}px`, margin: "0 auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <foreignObject x={0} y={0} width={w} height={h}>
          {children}
        </foreignObject>
      </svg>
    </div>
  );
}

/**
 * Fixed-width fit via CSS transform. Used for thumbnails and for the headless
 * export, where a deterministic pixel size matters more than fluid width.
 */
export function SlideScaled({
  style,
  width,
  children,
}: {
  style: TemplateStyleId;
  width: number;
  children: ReactNode;
}) {
  const { w, h } = getManifest(style).base;
  const k = width / w;
  return (
    <div style={{ width: `${width}px`, height: `${h * k}px`, position: "relative", flexShrink: 0 }}>
      <div
        style={{
          width: `${w}px`,
          height: `${h}px`,
          transform: `scale(${k})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
