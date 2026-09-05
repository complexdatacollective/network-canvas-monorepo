import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ValidationContradiction } from '@codaco/protocol-validation';

import type * as VariableValidation from '../../../codebook/variableValidation.ts';
import { findDraftContradictions } from '../../../codebook/variableValidation.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import CategoricalBinPromptsSection from '../CategoricalBinPromptsSection.tsx';

/**
 * The detector, so the channel it answers through can be driven.
 *
 * `PromptAttributeField` refuses a set of values the attribute's own committed
 * rules could never be satisfied by, and the question here is what the
 * researcher is told when it does — not which drafts it finds. Driving it with
 * a real contradiction is not currently possible from this side: the request
 * `VariableEditor` builds is validated against the codebook schema BEFORE the
 * submit hook is called, and that schema runs the same contradiction rules
 * over the same variables, so it refuses first, as a thrown draft error.
 *
 * Only `findDraftContradictions` is replaced; everything else in the module —
 * the pool filters the section reads through it — stays real.
 */
vi.mock('../../../codebook/variableValidation.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof VariableValidation>();
  return {
    ...actual,
    findDraftContradictions: vi.fn(actual.findDraftContradictions),
  };
});

/**
 * What a contradiction says, in the shape `findDraftContradictions` writes:
 * the rule and the counts that cannot both hold.
 */
const CONTRADICTION =
  'Attribute "contactType": minSelected (3) is greater than the number of options (2)';

/**
 * `compoundFailureCopy`'s words for a request that could not be sent, which is
 * what this refusal used to be reported as.
 *
 * Written out rather than imported: a test reading the same table as the
 * component would still pass if that table were replaced by a passthrough.
 */
const REFUSED_INVALID_REQUEST =
  'This change could not be sent, and nothing was saved. Close this editor and try again.';

describe('an attribute pick that refuses the values it is given', () => {
  /**
   * The one refusal a researcher reads in the words it arrived in.
   *
   * Every other way a codebook save can be refused is rewritten by
   * `compoundFailureCopy`, because it arrives written for whoever reads a log
   * — a host's account of a path in a protocol document, not of anything the
   * researcher did. This one arrives naming the rule and the values that
   * cannot both hold, which is more than that module could say about it: it
   * does not know which rule was broken.
   *
   * The second assertion is the whole point. Reported the way it was before
   * `AuxiliaryCodebookContradiction` existed — a `failed` result carrying the
   * sentence in `message` — the sentence was the one field the copy module
   * discards, and the researcher was told the change could not be sent.
   */
  it('tells the researcher which rule the values break', async () => {
    const harness = renderStageEditor({
      stageId: 'categorical-bin-1',
      sections: <CategoricalBinPromptsSection />,
    });
    const submit = vi.spyOn(harness.host, 'submit');

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: "Change this attribute's values",
      }),
    );

    // An edit the codebook schema itself accepts, so the refusal that follows
    // can only be this section's own.
    const label = await screen.findByRole('textbox', {
      name: 'Option 1 label',
    });
    await harness.user.clear(label);
    await harness.user.type(label, 'Face to face');

    vi.mocked(findDraftContradictions).mockReturnValue([
      {
        class: 'minSelectedExceedsOptions',
        message: CONTRADICTION,
        variableIds: ['contactType'],
        strips: [{ variableId: 'contactType', rule: 'minSelected' }],
      } satisfies ValidationContradiction,
    ]);

    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    const report = await screen.findByRole('alert');
    expect(report).toHaveTextContent(CONTRADICTION);
    expect(report).not.toHaveTextContent(REFUSED_INVALID_REQUEST);

    // Refused before anything was sent, with the draft still on screen to fix.
    expect(submit).not.toHaveBeenCalled();
    expect(label).toHaveValue('Face to face');
    expect(harness.pendingCommands()).toEqual([]);
  });
});
