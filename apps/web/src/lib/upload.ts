/**
 * Upload constraints, shared by the server action that enforces them and the
 * client control that has to advertise them.
 *
 * Kept out of `lib/assets.ts` on purpose: that module is `server-only`, and the
 * upload button needs the accept list and the size ceiling in the browser.
 */

/**
 * What we accept. Deliberately narrow: these are the types the renderer can
 * draw in a CSS background and the worker can screenshot, and the list doubles
 * as the file input's `accept` attribute.
 */
export const UPLOAD_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export const UPLOAD_ACCEPT = Object.keys(UPLOAD_MIME).join(",");

/**
 * Per-file ceiling. Server Actions cap the request body at 1MB by default, so
 * `next.config.ts` raises `serverActions.bodySizeLimit` to 8mb; the upload path
 * enforces the same number where it can return a readable error instead of a
 * rejected request, and the button checks it before spending the round trip.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Asset kinds a human can upload. `video`/`audio` are pipeline output only. */
export const UPLOADABLE_KINDS = ["photo", "screen", "logo"] as const;
export type UploadableKind = (typeof UPLOADABLE_KINDS)[number];
