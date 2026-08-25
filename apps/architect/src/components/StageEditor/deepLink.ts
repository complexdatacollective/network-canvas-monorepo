import { useEffect } from 'react';
import { useSearch } from 'wouter';

/**
 * Opening a stage editor AT one of its sections.
 *
 * A stage editor is one long form, and a screen that says "change this on the
 * stage" is only useful if it can say WHERE — the synthetic overview links a
 * stage's row to the section that owns the parameters the row is showing. So
 * the destination travels in the query (`?section=synthetic`), and the editor
 * scrolls that section into view and puts focus on it. A plain
 * `/protocol/stage/<id>` carries no target and is unaffected.
 *
 * The same shape as the codebook's own deep link (`Codebook/deepLink.ts`),
 * deliberately: one convention for "open that editor at this thing".
 */

const STAGE_PATH = '/protocol/stage';
const SECTION_PARAM = 'section';
const SECTION_ATTRIBUTE = 'data-stage-section';

/** The sections a link may name. */
export const STAGE_SECTION_SYNTHETIC = 'synthetic';

export type StageSection = typeof STAGE_SECTION_SYNTHETIC;

/** The href that opens one stage's editor at one of its sections. */
export const stageSectionHref = (
  stageId: string,
  section: StageSection,
): string => {
  const params = new URLSearchParams();
  params.set(SECTION_PARAM, section);
  return `${STAGE_PATH}/${stageId}?${params.toString()}`;
};

/**
 * Marks the section a `?section=` link lands on.
 *
 * `tabIndex: -1` so focus can land on the section itself where it carries no
 * control of its own — programmatic only, so it never joins the tab order.
 */
export const stageSectionMarker = (section: StageSection) => ({
  [SECTION_ATTRIBUTE]: section,
  tabIndex: -1,
});

/** What a researcher can operate; the section's own control, where it has one. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const escapeAttributeValue = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

/**
 * Scrolls the stage editor to whatever section the current query names, and
 * lands focus on it.
 *
 * Focus goes to the section's own first control — its disclosure — because a
 * link to a section is a request to work on it, and opening it is where that
 * work starts. A section that is not on the page (a link to a parameter this
 * stage type does not admit) does nothing at all: never a jump somewhere the
 * link did not ask for.
 */
export const useStageSectionDeepLink = (): void => {
  const search = useSearch();

  useEffect(() => {
    const section = new URLSearchParams(search).get(SECTION_PARAM);
    if (section === null || section === '') return;

    const target = document.querySelector<HTMLElement>(
      `[${SECTION_ATTRIBUTE}="${escapeAttributeValue(section)}"]`,
    );
    if (!target) return;

    target.scrollIntoView({ block: 'center' });
    const control = target.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (control ?? target).focus({ preventScroll: true });
  }, [search]);
};
