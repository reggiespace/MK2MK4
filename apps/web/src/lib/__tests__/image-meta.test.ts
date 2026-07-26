import { describe, expect, it } from "vitest";
import { imageMeta } from "../image-meta";

/**
 * These parse real header bytes rather than decoding pixels, so the tests build
 * the smallest legal header per format and check the two numbers come back.
 * A regression here is silent — the upload still succeeds, the Asset row just
 * carries null dimensions — so it needs a test rather than a manual look.
 */

function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** SOI, a skippable APP0 segment, then the SOF0 that carries the size. */
function jpeg(w: number, h: number): Buffer {
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write("JFIF\0", 4, "ascii");

  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(9, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function gif(w: number, h: number): Buffer {
  const b = Buffer.alloc(13);
  b.write("GIF89a", 0, "ascii");
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}

function webpVp8(w: number, h: number): Buffer {
  const b = Buffer.alloc(32);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8 ", 12, "ascii");
  b.writeUInt16LE(w & 0x3fff, 26);
  b.writeUInt16LE(h & 0x3fff, 28);
  return b;
}

function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(32);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  const put = (n: number, o: number) => {
    b[o] = n & 0xff;
    b[o + 1] = (n >> 8) & 0xff;
    b[o + 2] = (n >> 16) & 0xff;
  };
  put(w - 1, 24);
  put(h - 1, 27);
  return b;
}

describe("imageMeta", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(imageMeta(png(1080, 1350))).toEqual({ width: 1080, height: 1350 });
  });

  it("walks past JPEG metadata segments to the start-of-frame", () => {
    expect(imageMeta(jpeg(1080, 1920))).toEqual({ width: 1080, height: 1920 });
  });

  it("reads GIF's little-endian screen descriptor", () => {
    expect(imageMeta(gif(400, 250))).toEqual({ width: 400, height: 250 });
  });

  it("reads both WebP container variants", () => {
    expect(imageMeta(webpVp8(640, 480))).toEqual({ width: 640, height: 480 });
    // VP8X stores minus-one values, so an off-by-one here is easy to ship.
    expect(imageMeta(webpVp8x(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("reports an SVG's viewBox as its intrinsic size", () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 128">');
    expect(imageMeta(svg)).toEqual({ width: 512, height: 128 });
  });

  it("falls back to an SVG's width and height attributes", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"></svg>');
    expect(imageMeta(svg)).toEqual({ width: 240, height: 60 });
  });

  it("returns null for anything that isn't an image", () => {
    // This is the check that stops a renamed .exe from being stored as a logo:
    // the upload path treats a null here as "not a readable image" and rejects.
    expect(imageMeta(Buffer.from("MZ\x90\x00this is a windows binary"))).toBeNull();
    expect(imageMeta(Buffer.from("{\"json\": true}"))).toBeNull();
    expect(imageMeta(Buffer.alloc(0))).toBeNull();
  });

  it("does not hang on a JPEG whose segments never reach a frame header", () => {
    // A truncated or malformed file must terminate the marker walk, not spin.
    const truncated = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(400, 0xff)]);
    expect(imageMeta(truncated)).toBeNull();
  });
});
