import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import ProtocolField from '../../form/ProtocolField.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';

const SEARCH: SectionCapability = {
  fields: ['searchOptions'],
  confirmClear: {
    title: 'Remove the search settings?',
    description: 'The columns participants can search will be forgotten.',
    confirmLabel: 'Remove them',
  },
};

/**
 * A capability whose values only mean anything against something chosen
 * elsewhere — a roster's columns, named by a data file the researcher picks in
 * another section. That is the whole shape `resetOn` exists for.
 */
function SearchOptions() {
  const [dataSource, setDataSource] = useState('roster_data');
  return (
    <>
      <Button type="button" onClick={() => setDataSource('another_roster')}>
        Choose another roster
      </Button>
      <BuilderSection
        title="Search options"
        capability={SEARCH}
        resetOn={dataSource}
      >
        <ProtocolField
          name="searchOptions.fuzziness"
          label="Fuzziness"
          component={InputField}
        />
      </BuilderSection>
    </>
  );
}

const openSection = () => ({
  stageId: 'name-generator-roster-1',
  sections: <SearchOptions />,
});

describe('a capability that only means anything against something else', () => {
  it('opens on what the stage was saved with, rather than resetting itself', async () => {
    renderStageEditor(openSection());

    // The first render is a stage being opened, not a change: resetting here
    // would empty a section the researcher has not touched.
    expect(
      await screen.findByRole('textbox', { name: 'Fuzziness' }),
    ).toHaveValue('0.4');
  });

  it('clears and switches off when the thing it describes changes', async () => {
    const harness = renderStageEditor(openSection());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );

    // Without asking: the values did not become wrong through anything the
    // researcher did to THIS section, so there is no decision to put to them.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Search options')
          ?.state,
      ).toBe('Switched off'),
    );
  });

  it('leaves nothing of the old choice behind when it is switched back on', async () => {
    const harness = renderStageEditor(openSection());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Search options' }),
    );

    // The value is gone rather than merely hidden: a section that only closed
    // over its fields would replay the old roster's settings on save.
    expect(
      await screen.findByRole('textbox', { name: 'Fuzziness' }),
    ).toHaveValue('');
  });
});
