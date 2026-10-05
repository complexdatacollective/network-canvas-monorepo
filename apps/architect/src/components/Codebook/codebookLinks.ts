const CODEBOOK_PATH = '/protocol/codebook';

/** Something on the Codebook page that a link can open the editor of. */
export type CodebookLink =
  | { kind: 'type'; entity: 'node' | 'edge'; type: string }
  | { kind: 'variable'; variable: string };

/**
 * The Codebook page, opening the type editor or the attribute label editor
 * named by `link` when one is given.
 */
export const codebookHref = (link?: CodebookLink) => {
  if (!link) return CODEBOOK_PATH;
  const params = new URLSearchParams(
    link.kind === 'type'
      ? { entity: link.entity, type: link.type }
      : { variable: link.variable },
  );
  return `${CODEBOOK_PATH}?${params.toString()}`;
};

/** The editor a Codebook page URL asks to open, if any. */
export const readCodebookLink = (
  params: URLSearchParams,
): CodebookLink | undefined => {
  const variable = params.get('variable');
  if (variable) return { kind: 'variable', variable };
  const entity = params.get('entity');
  const type = params.get('type');
  if ((entity === 'node' || entity === 'edge') && type) {
    return { kind: 'type', entity, type };
  }
  return undefined;
};
