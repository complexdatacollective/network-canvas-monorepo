import { useEffect } from 'react';
import { useSearch } from 'wouter';

import { syntheticSubjectKey } from '@codaco/protocol-validation';

/**
 * Opening the codebook AT something: an entity type, or one of its attributes.
 *
 * The codebook is one long page, and a screen that says "open the Codebook to
 * change this" is only useful if it can say WHICH row. So the destination is
 * carried in the query — `?entity=node:person&variable=<id>` — and the page
 * scrolls that row into view and puts focus on it. A plain
 * `/protocol/codebook` carries no target and is unaffected.
 *
 * The entity is keyed by `syntheticSubjectKey`, the schema's own way of naming
 * a subject, so a link and the row it points at cannot disagree about what
 * "node:person" means.
 */

const CODEBOOK_PATH = '/protocol/codebook';

const ENTITY_PARAM = 'entity';
const VARIABLE_PARAM = 'variable';

const ENTITY_ATTRIBUTE = 'data-codebook-entity';
const VARIABLE_ATTRIBUTE = 'data-codebook-variable';

/** What a link asks the codebook to open at. */
type CodebookTarget = {
  /** `node:person`, `edge:friend`, or `ego`. */
  subjectKey: string;
  variableId: string | undefined;
};

export type CodebookSubject = {
  entity: 'node' | 'edge' | 'ego';
  type?: string | undefined;
};

/** The href that opens the codebook at one entity type, or one attribute. */
export const codebookHref = (
  subject: CodebookSubject | string,
  variableId?: string,
): string => {
  const params = new URLSearchParams();
  params.set(
    ENTITY_PARAM,
    typeof subject === 'string' ? subject : syntheticSubjectKey(subject),
  );
  if (variableId !== undefined) params.set(VARIABLE_PARAM, variableId);
  return `${CODEBOOK_PATH}?${params.toString()}`;
};

/** The target a query string names, or `undefined` where it names none. */
const codebookTargetOf = (search: string): CodebookTarget | undefined => {
  const params = new URLSearchParams(search);
  const subjectKey = params.get(ENTITY_PARAM);
  if (subjectKey === null || subjectKey === '') return undefined;
  return {
    subjectKey,
    variableId: params.get(VARIABLE_PARAM) ?? undefined,
  };
};

/** Marks the section an `?entity=` link lands on. */
export const codebookEntityMarker = (subject: CodebookSubject) => ({
  [ENTITY_ATTRIBUTE]: syntheticSubjectKey(subject),
});

/**
 * Marks the row an `?entity=…&variable=…` link lands on.
 *
 * `tabIndex: -1` so focus can land here when the row carries no control of
 * its own — programmatic only, so it never joins the tab order.
 */
export const codebookVariableMarker = (
  subject: CodebookSubject,
  variableId: string,
) => ({
  [VARIABLE_ATTRIBUTE]: `${syntheticSubjectKey(subject)}/${variableId}`,
  tabIndex: -1,
});

/** What a researcher can operate; the row's own control, where it has one. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const escapeAttributeValue = (value: string): string =>
  // Variable ids and codebook keys are researcher-authored in principle, and
  // CSS.escape is what makes an attribute selector safe for any of them.
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

/**
 * Scrolls the codebook to whatever the current query names, and lands focus on
 * an attribute row.
 *
 * Focus moves only for a row: an attribute link is a request to work on that
 * attribute, and the row's own control is where that work starts. A link
 * naming only an entity type has no such destination, so it scrolls and leaves
 * focus where the route change put it — on the page heading, with the whole
 * page ahead of the next Tab.
 *
 * A target that is not on the page — an attribute the current filter hides, or
 * one that has since been deleted — falls back to its entity's section, and
 * failing that does nothing. Never a jump to somewhere the link did not ask
 * for.
 */
export const useCodebookDeepLink = (): void => {
  const search = useSearch();

  useEffect(() => {
    const target = codebookTargetOf(search);
    if (target === undefined) return;

    const { subjectKey, variableId } = target;
    const row =
      variableId === undefined
        ? null
        : document.querySelector<HTMLElement>(
            `[${VARIABLE_ATTRIBUTE}="${escapeAttributeValue(`${subjectKey}/${variableId}`)}"]`,
          );

    if (row) {
      row.scrollIntoView({ block: 'center' });
      const control = row.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (control ?? row).focus({ preventScroll: true });
      return;
    }

    document
      .querySelector<HTMLElement>(
        `[${ENTITY_ATTRIBUTE}="${escapeAttributeValue(subjectKey)}"]`,
      )
      ?.scrollIntoView({ block: 'start' });
  }, [search]);
};
