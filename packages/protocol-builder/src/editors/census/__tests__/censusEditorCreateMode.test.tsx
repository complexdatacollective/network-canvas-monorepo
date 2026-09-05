import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import type { StageEditorActions } from '../../../stage-editor-contract.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { CategoricalBinStageEditor } from '../CategoricalBinStageEditor.tsx';
import { DyadCensusStageEditor } from '../DyadCensusStageEditor.tsx';
import { OneToManyDyadCensusStageEditor } from '../OneToManyDyadCensusStageEditor.tsx';
import { OrdinalBinStageEditor } from '../OrdinalBinStageEditor.tsx';
import { TieStrengthCensusStageEditor } from '../TieStrengthCensusStageEditor.tsx';
import { CREATE_POSITION, stageNameInput } from './createMode.ts';

/**
 * A brand-new stage of each interface, saved.
 *
 * Each editor's own file proves what its create mode OFFERS — the proposed
 * name, the template it opens on, the destinations its insertion position
 * allows. None of them proves the researcher can finish: that everything the
 * schema requires of a new stage of this type is reachable from the template,
 * and that supplying it produces a stage a host accepts. The interfaces with a
 * required task introduction, and the ordinal bin's required gradient, are
 * exactly the ones an editor could quietly refuse forever or quietly save
 * invalid.
 */

const actions: StageEditorActions = ({ formId }) => (
  <SubmitButton form={formId}>Save stage</SubmitButton>
);

/** Names the stage and says which type of person it is about. */
const nameStage = async (harness: StageEditorHarness, label: string) => {
  await waitFor(() => expect(stageNameInput()).toBeInTheDocument());
  await harness.user.clear(stageNameInput());
  await harness.user.type(stageNameInput(), label);
  await harness.user.click(screen.getByRole('radio', { name: 'person' }));
};

const fillIntroduction = async (harness: StageEditorHarness) => {
  await harness.user.type(
    screen.getByRole('textbox', { name: 'Introduction heading' }),
    'Pairs',
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: 'Introduction text' }),
    'You will see pairs.',
  );
};

const openNewPrompt = async (harness: StageEditorHarness) => {
  await harness.user.click(
    screen.getByRole('button', { name: 'Create new prompt' }),
  );
  await screen.findByRole('dialog');
  await harness.user.type(
    await screen.findByRole('textbox', { name: 'Prompt text' }),
    'A question',
  );
};

const commitNewPrompt = async (harness: StageEditorHarness) => {
  await harness.user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
};

describe('creating a census or bin stage from its interface template', () => {
  it('saves a new Categorical Bin', async () => {
    const harness = renderStageEditor({
      create: { type: 'CategoricalBin', position: CREATE_POSITION },
      editor: CategoricalBinStageEditor,
      actions,
    });

    await nameStage(harness, 'Contact');
    await openNewPrompt(harness);
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactType',
    );
    await commitNewPrompt(harness);

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({ type: 'CategoricalBin' });
  });

  it('saves a new Ordinal Bin once a gradient is chosen', async () => {
    const harness = renderStageEditor({
      create: { type: 'OrdinalBin', position: CREATE_POSITION },
      editor: OrdinalBinStageEditor,
      actions,
    });

    await nameStage(harness, 'Frequency');
    await openNewPrompt(harness);
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactFreq',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'Sea Green' }));
    await commitNewPrompt(harness);

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({ type: 'OrdinalBin' });
    // The gradient reached the saved prompt, rather than being collected and
    // dropped: `ord-color-seq-1` is the first swatch of the schema's sequence.
    expect(request?.stageDocument.prompts).toMatchObject([
      { color: 'ord-color-seq-1' },
    ]);
  });

  it('saves a new Dyad Census', async () => {
    const harness = renderStageEditor({
      create: { type: 'DyadCensus', position: CREATE_POSITION },
      editor: DyadCensusStageEditor,
      actions,
    });

    await nameStage(harness, 'Who knows who');
    await fillIntroduction(harness);
    await openNewPrompt(harness);
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await commitNewPrompt(harness);

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({ type: 'DyadCensus' });
  });

  /**
   * The template carries no task introduction, and the schema requires one —
   * so the editor has to refuse rather than send a stage a host would reject.
   */
  it('refuses a new Dyad Census with no task introduction', async () => {
    const harness = renderStageEditor({
      create: { type: 'DyadCensus', position: CREATE_POSITION },
      editor: DyadCensusStageEditor,
      actions,
    });

    await nameStage(harness, 'Who knows who');
    await openNewPrompt(harness);
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await commitNewPrompt(harness);

    expect(await harness.submit()).toBeNull();
  });

  it('saves a new One-to-Many Dyad Census', async () => {
    const harness = renderStageEditor({
      create: { type: 'OneToManyDyadCensus', position: CREATE_POSITION },
      editor: OneToManyDyadCensusStageEditor,
      actions,
    });

    await nameStage(harness, 'Who knows who');
    await openNewPrompt(harness);
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await commitNewPrompt(harness);

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'OneToManyDyadCensus',
      behaviours: { removeAfterConsideration: true },
    });
  });

  it('saves a new Tie-Strength Census', async () => {
    const harness = renderStageEditor({
      create: { type: 'TieStrengthCensus', position: CREATE_POSITION },
      editor: TieStrengthCensusStageEditor,
      actions,
    });

    await nameStage(harness, 'How close');
    await fillIntroduction(harness);
    await openNewPrompt(harness);
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Attribute' }),
      'closeness',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Decline answer' }),
      'Not connected',
    );
    await commitNewPrompt(harness);

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({ type: 'TieStrengthCensus' });
  });
});
