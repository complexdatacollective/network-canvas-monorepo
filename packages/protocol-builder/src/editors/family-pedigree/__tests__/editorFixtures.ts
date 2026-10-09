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
 * Opens every group of the participant wording, whose fields are on screen
 * only while their group is open, so a test that needs every key of the stage
 * on screen has the wording's too.
 */
export async function openEveryWordingGroup(
  harness: Readonly<{ user: UserEvent }>,
): Promise<void> {
  for (const name of PARTICIPANT_WORDING_GROUP_TITLES) {
    const trigger = await screen.findByRole('button', { name });
    if (trigger.getAttribute('aria-expanded') === 'true') continue;
    await harness.user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
  }
}

/** What each group of the participant wording is called on screen. */
export const PARTICIPANT_WORDING_GROUP_TITLES = [
  'Drawing the family',
  'Connecting people',
  'Adding a family member',
] as const;
