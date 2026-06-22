/**
 * The single source of truth for the text a piece actually posts as: the
 * caption followed by its hashtags, separated by blank lines.
 *
 * Both the publishers (Buffer/Zernio) and the pipeline's caption-length gate
 * must use this so the gate validates the exact text that will be scheduled —
 * otherwise hashtags appended at publish time could push a "passing" caption
 * over a platform limit.
 */
export function composePostText(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  return [caption, ...tags].join("\n\n");
}
