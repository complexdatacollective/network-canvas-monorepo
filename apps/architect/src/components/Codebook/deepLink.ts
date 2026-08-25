import { useEffect, useMemo } from 'react';
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
 * A link naming an ATTRIBUTE asks for more than a scroll: the row it lands on
 * opens its synthetic sub-editor too, so the researcher arrives at the controls
 * rather than one click short of them (see `useCodebookVariableTarget`, which
 * the attribute table reads). Focus is unchanged either way — the row's own
 * first control, as below.
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

/** The attribute the current query names, where it names one. */
export type CodebookVariableTarget = {
  /** `node:person`, `edge:friend`, or `ego`. */
  subjectKey: string;
  variableId: string;
};

/**
 * The attribute a link asks the codebook to open at, for the row that has to
 * open AT it.
 *
 * Separate from {@link useCodebookDeepLink}, which moves the page: this is the
 * same question asked declaratively, by the one row whose own state the link
 * changes. Reading the query in both places rather than passing a target down
 * keeps the link's meaning in one module while letting each consumer answer
 * it in its own terms — a scroll and a focus there, an opened sub-editor here.
 */
export const useCodebookVariableTarget = ():
  | CodebookVariableTarget
  | undefined => {
  const search = useSearch();

  return useMemo(() => {
    const target = codebookTargetOf(search);
    if (target?.variableId === undefined) return undefined;
    return { subjectKey: target.subjectKey, variableId: target.variableId };
  }, [search]);
};

/**
 * Marks the region an attribute link LANDS in, where the row has one.
 *
 * The row marker below is where a link SCROLLS to; this is where it puts
 * focus. They are not the same element, because a row's first focusable
 * control in document order is its name pill — so a link asking for an
 * attribute's generation settings, which opens that attribute's sub-editor,
 * dropped the researcher on the rename control at the other side of the table
 * and left them to find the thing the link had just opened.
 *
 * A region rather than the control itself, so the cell can say "the link lands
 * here" without the disclosure inside it having to take a prop for it; the
 * first control within is what focus goes to. A row with no such region — an
 * attribute nothing is generated for — falls back to the row, as before.
 */
const VARIABLE_LANDING_ATTRIBUTE = 'data-codebook-variable-landing';

export const codebookVariableLandingMarker = (
  subject: CodebookSubject,
  variableId: string,
) => ({
  [VARIABLE_LANDING_ATTRIBUTE]: `${syntheticSubjectKey(subject)}/${variableId}`,
});

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
 * attribute, and the control that work starts at is where focus goes — the
 * row's landing region where it declares one (see
 * {@link codebookVariableLandingMarker}), and the row's own first control
 * otherwise. A link naming only an entity type has no such destination, so it
 * scrolls and leaves focus where the route change put it — on the page
 * heading, with the whole page ahead of the next Tab.
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
    const rowKey =
      variableId === undefined
        ? undefined
        : escapeAttributeValue(`${subjectKey}/${variableId}`);
    const row =
      rowKey === undefined
        ? null
        : document.querySelector<HTMLElement>(
            `[${VARIABLE_ATTRIBUTE}="${rowKey}"]`,
          );

    if (row) {
      row.scrollIntoView({ block: 'center' });
      const landing = document.querySelector<HTMLElement>(
        `[${VARIABLE_LANDING_ATTRIBUTE}="${rowKey ?? ''}"]`,
      );
      const control =
        landing?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        row.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
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
