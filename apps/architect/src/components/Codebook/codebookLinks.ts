const CODEBOOK_PATH = '/protocol/codebook';

/** A type on the Codebook page that a link can open the editor of. */
type CodebookLink = { entity: 'node' | 'edge'; type: string };

/**
 * The Codebook page, opening the type editor named by `link` when one is
 * given.
 */
export const codebookHref = (link?: CodebookLink) => {
  if (!link) return CODEBOOK_PATH;
  const params = new URLSearchParams({ entity: link.entity, type: link.type });
  return `${CODEBOOK_PATH}?${params.toString()}`;
};

/** The type editor a Codebook page URL asks to open, if any. */
export const readCodebookLink = (
  params: URLSearchParams,
): CodebookLink | undefined => {
  const entity = params.get('entity');
  const type = params.get('type');
  if ((entity === 'node' || entity === 'edge') && type) {
    return { entity, type };
  }
  return undefined;
};
