/**
 * Mention extraction.
 *
 * Body convention: `@firstname` or `@first.last` matches a staff
 * member by case-insensitive prefix on their name. Multiple matches
 * pick the active user with the most-recent lastLoginAt (the
 * person who's actually around). Unmatched @-strings are left in
 * the body verbatim (no rewrite); they just don't generate a
 * mention row.
 *
 * The matcher runs server-side at comment-write time so the doctor-
 * app can stay lean — no client-side autocomplete required for v1.
 * Future: add a `users[]` typeahead in the composer that inserts
 * canonical `@user-id-hash` tokens.
 */

const MENTION_RE = /@([a-zA-Z][a-zA-Z0-9._-]{1,40})/g;

export interface StaffCandidate {
  id: string;
  name: string;
  lastLoginAt: Date | null;
  isActive: boolean;
}

/**
 * Extract @mention handles from the body. Returns lowercase
 * handles in source order (deduplicated).
 */
export function extractHandles(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const handle = match[1].toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}

/**
 * Resolve handles to staff user ids. The handle matches when
 * the user's name (lowercased, spaces stripped) starts with it,
 * OR when their email's local-part (before @) starts with it.
 *
 * Multiple matches → pick the most-recently-active candidate.
 * Zero matches → omit (no mention row).
 *
 * The caller passes the candidate pool already filtered to the
 * relevant tenant + isActive=true so this function only does
 * matching, no permission logic.
 */
export function resolveMentions(
  handles: string[],
  candidates: Array<StaffCandidate & { email: string }>,
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const handle of handles) {
    const matches = candidates.filter((c) => {
      const nameKey = c.name.toLowerCase().replace(/[^a-z0-9.]/g, "");
      const emailLocal = c.email.split("@")[0].toLowerCase();
      return nameKey.startsWith(handle) || emailLocal.startsWith(handle);
    });
    if (matches.length === 0) continue;
    matches.sort((a, b) => {
      const at = a.lastLoginAt?.getTime() ?? 0;
      const bt = b.lastLoginAt?.getTime() ?? 0;
      return bt - at;
    });
    const userId = matches[0].id;
    if (!seen.has(userId)) {
      seen.add(userId);
      resolved.push(userId);
    }
  }
  return resolved;
}
