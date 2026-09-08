import { describe, expect, it } from 'vitest';

import StageNameSection from '../../sections/StageNameSection.tsx';
import type { StageEditorActionContext } from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../renderStageEditor.tsx';

const SAVE = 'Save stage';

/**
 * A host's own save control, rendered the way the action-context contract says
 * one may be: a plain button, outside the form, associated with it by `formId`
 * and nothing else.
 *
 * `formId` is documented as the whole contract for a submit control rendered
 * outside the form — so this IS a conforming host, and anything the harness
 * needs from a save control other than that has to be got from somewhere the
 * host does not own.
 */
const nativeSaveButton = ({ formId }: StageEditorActionContext) => (
  <button type="submit" form={formId}>
    {SAVE}
  </button>
);

/**
 * `submit()` waited for the SUBMIT CONTROL to report `aria-busy="false"`,
 * which only the package's own `SubmitButton` says. A host rendering a plain
 * `<button form={formId}>` never satisfied it: the refusal appeared on screen,
 * the form settled, and the wait went on until the suite's own timeout killed
 * the test — reported against whatever the test was doing rather than against
 * the control the host supplied.
 *
 * What settled is a fact about the FORM, so it is read from the form.
 */
describe('a submit through a host’s own save control', () => {
  it('answers with the refusal when the stage cannot be saved', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
      submitLabel: SAVE,
      actions: nativeSaveButton,
    });

    const name = await harness.findByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(name);

    // The control the host rendered carries no busy state of its own, which is
    // exactly what the old wait was reading.
    expect(harness.getByRole('button', { name: SAVE })).not.toHaveAttribute(
      'aria-busy',
    );

    expect(await harness.submit()).toBeNull();
  });

  it('answers with the request when the stage saves', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
      submitLabel: SAVE,
      actions: nativeSaveButton,
    });

    expect((await harness.submit())?.stageDocument.id).toBe('information-1');
  });

  /**
   * The control: the same refusal through the harness's own save control,
   * which does carry `aria-busy`. A wait that had simply stopped looking at
   * whether the submit finished would pass the two above and this one alike —
   * so this is here to keep the pair meaning "the refusal was observed",
   * rather than to prove the button still works.
   */
  it('answers the same way through the harness’s own control', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
    });

    const name = await harness.findByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(name);

    expect(await harness.submit()).toBeNull();
    expect(name).toHaveAttribute('aria-invalid', 'true');
  });
});
