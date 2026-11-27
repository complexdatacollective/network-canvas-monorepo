import { describe, expect, it } from 'vitest';

import { NEW_STAGE_POSITION } from '../../editors/__tests__/creationSignal.ts';
import {
  narrativeEditor,
  narrativeSections,
  openPreset,
} from '../../editors/narrative/__tests__/narrativeFixtures.tsx';
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

const WARNING_TITLE = 'Some nodes will have no position in this layout';

const narrativeAbout = (types: string[]) => {
  const fields = {
    label: { 'en-US': 'Narrative' },
    subject: { entity: 'node', types },
    background: { concentricCircles: 4 },
    presets: [
      {
        id: testId('narrative-preset'),
        label: { 'en-US': 'Positions' },
        layout: LAYOUT,
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
        'No stage places family member nodes in the layout “layout”, so they will never be shown here. Add a Sociogram or a Network Composer that places them in this layout, or choose another layout.',
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
});
