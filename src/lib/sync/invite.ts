/**
 * The file id inside an invitation link (`…/#/join/<fileId>`, PLAN.md "Sharing flow" step 2),
 * or a bare Drive file id, as a parent may paste either into the first run's „Mam
 * zaproszenie”. `undefined` for anything else.
 */
export function joinFileId(text: string): string | undefined {
  const trimmed = text.trim();
  const fromLink = trimmed.match(/#\/join\/([^/?#\s]+)/)?.[1];
  const candidate = fromLink === undefined ? trimmed : safeDecode(fromLink);
  // Drive file ids are URL-safe base64-like strings, well over 20 characters.
  return candidate !== undefined && /^[A-Za-z0-9_-]{20,}$/.test(candidate) ? candidate : undefined;
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
