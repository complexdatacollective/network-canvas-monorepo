import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NEW_STAGE_POSITION } from '../../editors/__tests__/creationSignal.ts';
import {
  narrativeEditor,
  narrativeSections,
  openPreset,
} from '../../editors/narrative/__tests__/narrativeFixtures.tsx';
import {
  attributeField,
  chooseAttributeById,
} from '../../testing/attributePicker.ts';
import {
  fixtureLayoutId,
  fixtureTypeId,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { suppliedWordingFor } from '../../testing/suppliedWording.ts';
import { testId } from '../../testing/testId.ts';

const PERSON = fixtureTypeId('node', 'person');
const FAMILY_MEMBER = fixtureTypeId('node', 'family member');
// The fixture's Sociogram and Network Composer place people in this layout;
// no stage places family members in it.
const LAYOUT = fixtureLayoutId('layout');
// Added to the codebook by the tests that need it; no stage places anything
// in it.
const UNPLACED = testId('unplaced-layout');

const WARNING_TITLE = 'No stage places some nodes in this layout';

const narrativeAbout = (types: string[], layout = LAYOUT) => {
  const fields = {
    label: { 'en-US': 'Narrative' },
    subject: { entity: 'node', types },
    background: { concentricCircles: 4 },
    presets: [
      {
        id: testId('narrative-preset'),
        label: { 'en-US': 'Positions' },
        layout,
      },
    ],
  };
  return {
    stage: {
      id: testId('narrative-stage'),
      type: 'Narrative' as const,
      fields: {
        ...fields,
        ...suppliedWordingFor({ type: 'Narrative', ...fields }),
      },
    },
    sections: narrativeSections,
  };
};

describe('the warning about a layout with no positions for a node type', () => {
  it('warns when a reading stage includes a type no stage sets the layout for', async () => {
    const harness = renderStageEditor(narrativeAbout([FAMILY_MEMBER]));

    const preset = await openPreset(harness);

    expect(await preset.findByText(WARNING_TITLE)).toBeInTheDocument();
    expect(
      preset.getByText(
        'No stage places family member nodes in the layout “layout”, so they are shown here only if a roster gives them positions in this layout. Add a Sociogram or a Network Composer that places them in this layout, or choose another layout.',
      ),
    ).toBeInTheDocument();
  });

  it('does not warn once another stage sets it', async () => {
    const harness = renderStageEditor(narrativeAbout([PERSON]));

    const preset = await openPreset(harness);

    expect(
      await preset.findByRole('textbox', { name: 'Preset label' }),
    ).toBeInTheDocument();
    expect(preset.queryByText(WARNING_TITLE)).not.toBeInTheDocument();
  });

  it('judges a stage that is not saved yet', async () => {
    // Not in the protocol's stages yet, so only the stage as it is being
    // edited can say that it shows the layout for family members.
    const harness = renderStageEditor({
      create: {
        type: 'Narrative',
        position: NEW_STAGE_POSITION,
        fields: {
          subject: { entity: 'node', types: [FAMILY_MEMBER] },
          presets: [
            {
              id: testId('narrative-preset'),
              label: { 'en-US': 'Positions' },
              layout: LAYOUT,
            },
          ],
        },
      },
      editor: narrativeEditor,
    });

    const preset = await openPreset(harness);

    expect(await preset.findByText(WARNING_TITLE)).toBeInTheDocument();
  });

  // The saved stage is in the protocol too. Each case below changes only the
  // picker, so the warning can follow it only by judging the preset as it is
  // being edited, in place of the saved copy of the stage.
  it('warns as soon as the picker chooses a layout with no positions for the type', async () => {
    const harness = renderStageEditor(narrativeAbout([PERSON]));
    harness.receiveCodebookUpdate({
      layouts: { [UNPLACED]: { name: 'unplaced' } },
    });

    const preset = await openPreset(harness);
    expect(
      await preset.findByRole('textbox', { name: 'Preset label' }),
    ).toBeInTheDocument();
    expect(preset.queryByText(WARNING_TITLE)).not.toBeInTheDocument();

    await chooseAttributeById(harness.user, attributeField('Layout'), UNPLACED);

    expect(await preset.findByText(WARNING_TITLE)).toBeInTheDocument();
    expect(
      preset.getByText(
        'No stage places person nodes in the layout “unplaced”, so they are shown here only if a roster gives them positions in this layout. Add a Sociogram or a Network Composer that places them in this layout, or choose another layout.',
      ),
    ).toBeInTheDocument();
  });

  it('stops warning as soon as the picker chooses a layout that another stage sets', async () => {
    const harness = renderStageEditor(narrativeAbout([PERSON], UNPLACED));
    harness.receiveCodebookUpdate({
      layouts: { [UNPLACED]: { name: 'unplaced' } },
    });

    const preset = await openPreset(harness);
    expect(await preset.findByText(WARNING_TITLE)).toBeInTheDocument();

    await chooseAttributeById(harness.user, attributeField('Layout'), LAYOUT);

    await waitFor(() =>
      expect(preset.queryByText(WARNING_TITLE)).not.toBeInTheDocument(),
    );
  });
});
