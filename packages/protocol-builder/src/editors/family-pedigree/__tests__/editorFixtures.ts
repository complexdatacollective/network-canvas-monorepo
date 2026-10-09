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
 * Opens one group of the participant wording, whose fields are on screen only
 * while their group is open.
 *
 * A whole-stage round trip opens one group rather than all of them: any one
 * puts a field on screen that edits the stage's `wording`, the closed groups'
 * settings come back as the stage holds them, and mounting every group's
 * dozens of rich-text editors is what made those tests time out. Each group's
 * own fields are round-tripped by a test of their own
 * (`FamilyPedigreeStageEditor.test.tsx`, "the participant wording").
 */
export async function openWordingGroup(
  harness: Readonly<{ user: UserEvent }>,
  name: (typeof PARTICIPANT_WORDING_GROUP_TITLES)[number] = 'Drawing the family',
): Promise<void> {
  const trigger = await screen.findByRole('button', { name });
  await harness.user.click(trigger);
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
}

/** What each group of the participant wording is called on screen. */
export const PARTICIPANT_WORDING_GROUP_TITLES = [
  'Drawing the family',
  'Connecting people',
  'Adding a family member',
] as const;
