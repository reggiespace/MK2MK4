/**
 * The identity every studio function is called with.
 *
 * Deliberately not a session: these functions serve both a server action (where
 * the caller came from an iron-session cookie) and the MCP route (where it came
 * from a bearer token). Nothing here can read a cookie.
 */
export interface StudioCaller {
  workspaceId: string;
  userId: string;
  /** Token id when the call came from an agent; null when it came from the UI. */
  tokenId: string | null;
  /** Granted scopes. UI callers hold every scope. */
  scopes: string[];
}

export const ALL_SCOPES = ["draft", "media", "render"] as const;
export type Scope = (typeof ALL_SCOPES)[number];

/** The caller a server action builds — full scopes, no token. */
export function uiCaller(workspaceId: string, userId: string): StudioCaller {
  return { workspaceId, userId, tokenId: null, scopes: [...ALL_SCOPES] };
}
