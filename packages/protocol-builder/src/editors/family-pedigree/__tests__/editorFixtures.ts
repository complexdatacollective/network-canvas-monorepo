import { screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';

import { mountedAs } from '../../__tests__/formEditorHarness.tsx';
import { familyPedigreeStageEditor } from '../FamilyPedigreeStageEditor.ts';

/**
 * The editor as the harness mounts it. No action chrome is supplied, so the
 * editor falls back to the shared save control, which stays enabled while the
 * editor is read-only so a refused write can be exercised.
 */
export const familyPedigreeEditor = mountedAs(
  familyPedigreeStageEditor.FamilyPedigree,
);

/**
 * jsdom has no layout, and the markdown editor measures the document on every
 * change and click. Shimmed as "measured nothing" so typed text reaches the
 * field; the editor's own fallbacks handle an unmeasured document.
 */
export function shimMarkdownEditorMeasurement(): void {
  const emptyRects = Object.assign([], {
    item: () => null,
  }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= () => emptyRects;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  Document.prototype.elementFromPoint ??= () => null;
}

/**
 * Switches the built-in wording on and opens the stage's own part of it,
 * whose fields are on screen only while it is open. The protocol holds
 * wording every pedigree shares, so the section splits into the stage's own
 * words and the shared ones, each a part that starts closed.
 */
export async function openStageWording(
  harness: Readonly<{ user: UserEvent }>,
): Promise<void> {
  // The section starts switched off over a single language's supplied
  // wording; its parts are on screen once it is on. Over a default language
  // Network Canvas has no wording in (the fixture's American English) it has
  // no switch: the researcher writes that wording, so it is always on.
  const section = await waitFor(() => {
    const toggle = screen.queryByRole('switch', {
      name: 'Customize built-in wording',
    });
    const part = screen.queryByRole('button', {
      name: 'Specific to this stage',
    });
    expect(toggle ?? part).not.toBeNull();
    return toggle;
  });
  if (section !== null && section.getAttribute('aria-checked') !== 'true') {
    await harness.user.click(section);
  }
  await openStageWordingPart(harness);
}

/** Opens the part of the wording section holding the stage's own words. */
async function openStageWordingPart(
  harness: Readonly<{ user: UserEvent }>,
): Promise<void> {
  const part = await screen.findByRole('button', {
    name: 'Specific to this stage',
  });
  if (part.getAttribute('aria-expanded') !== 'true') {
    await harness.user.click(part);
  }
  await waitFor(() => expect(part).toHaveAttribute('aria-expanded', 'true'));
}
