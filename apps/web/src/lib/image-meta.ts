/**
 * Intrinsic dimensions from an image's header bytes.
 *
 * The Asset row stores width/height so the library can show "1080×1350" and so
 * the logo picker can reject something that will render as mush. Decoding a
 * whole image to learn two numbers means pulling in `sharp` — a native binary
 * that has to be built for the slim runtime image — for a job that is a handful
 * of byte offsets. So: parse the header, per format.
 *
 * Returns null for anything unrecognised rather than throwing; the caller stores
 * the asset either way, it just won't have dimensions to show.
 */

export interface ImageMeta {
  width: number;
  height: number;
}

/** PNG: IHDR is always the first chunk, width/height at bytes 16..24. */
function png(b: Buffer): ImageMeta | null {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/**
 * JPEG: walk the marker segments to the start-of-frame, which carries the
 * dimensions. Everything before it (EXIF, ICC, thumbnails) is skippable, and
 * the segment length tells us how far.
 */
function jpeg(b: Buffer): ImageMeta | null {
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // SOF0-SOF15, minus the DHT/JPG/DAC markers that share the range.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** GIF: logical screen descriptor, little-endian, right after the signature. */
function gif(b: Buffer): ImageMeta | null {
  if (b.length < 10 || b.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

/**
 * WebP: three container variants, each storing the size differently. Lossy
 * (VP8) and lossless (VP8L) pack it into bitfields; the extended form (VP8X)
 * stores 24-bit minus-one values.
 */
function webp(b: Buffer): ImageMeta | null {
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    const at = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
    return { width: at(24) + 1, height: at(27) + 1 };
  }
  return null;
}

/**
 * SVG: no pixels, so report the viewBox (or the width/height attributes) as the
 * intrinsic size. Vector logos are the common case for a brand mark and would
 * otherwise show no dimensions at all.
 */
function svg(b: Buffer): ImageMeta | null {
  const head = b.toString("utf8", 0, Math.min(b.length, 2048));
  if (!head.includes("<svg")) return null;
  const box = /viewBox\s*=\s*["']\s*[-\d.]+[,\s]+[-\d.]+[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(head);
  if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
  const w = /\bwidth\s*=\s*["']([\d.]+)/.exec(head);
  const h = /\bheight\s*=\s*["']([\d.]+)/.exec(head);
  if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
  return null;
}

const READERS = [png, jpeg, gif, webp, svg];

export function imageMeta(bytes: Buffer): ImageMeta | null {
  for (const read of READERS) {
    const m = read(bytes);
    if (m && m.width > 0 && m.height > 0) return m;
  }
  return null;
}
