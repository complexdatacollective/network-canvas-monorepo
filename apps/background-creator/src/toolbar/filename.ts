// Turns a document title into a safe, lowercase, hyphenated filename stem.
// Diacritics are stripped, runs of non-alphanumerics collapse to single
// hyphens, and leading/trailing hyphens are trimmed. An empty result (e.g. a
// title of only punctuation) is left to the caller's fallback.
export function slug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Builds a download filename from the document title and an extension
// (including the leading dot, e.g. '.svg'), falling back to `fallbackStem` when
// the title slugifies to nothing.
export function documentFilename(
  title: string,
  extension: string,
  fallbackStem: string,
): string {
  const stem = slug(title) || fallbackStem;
  return `${stem}${extension}`;
}
