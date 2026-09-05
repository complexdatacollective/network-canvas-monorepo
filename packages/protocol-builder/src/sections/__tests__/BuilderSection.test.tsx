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

/**
 * The same capability, resetting on a value with structure — which is what a
 * section actually resets on: a subject, a chosen resource, a pair of ids. A
 * caller that builds one inline hands a new object on every render, so it is
 * the value that has to be compared rather than the object holding it.
 */
function SearchOptionsAgainstAResource() {
  const [dataSource, setDataSource] = useState('roster_data');
  const [unrelated, setUnrelated] = useState(0);
  return (
    <>
      <Button type="button" onClick={() => setUnrelated(unrelated + 1)}>
        Type in another section
      </Button>
      <Button type="button" onClick={() => setDataSource('another_roster')}>
        Choose another roster
      </Button>
      <BuilderSection
        title="Search options"
        capability={SEARCH}
        resetOn={{ entity: 'node', resource: dataSource }}
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

const openSectionAgainstAResource = () => ({
  stageId: 'name-generator-roster-1',
  sections: <SearchOptionsAgainstAResource />,
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

/**
 * What a capability's values mean anything against is rarely a string. A
 * roster's columns are named by a resource chosen in another section, a card's
 * details by the subject the stage works with — objects a caller assembles
 * where it renders the section. Compared by reference, every one of those is a
 * different object on every render, and the researcher's settings would be
 * thrown away by anything at all happening elsewhere in the editor.
 */
describe('a capability that resets on a value with structure', () => {
  it('survives a re-render that changed nothing it depends on', async () => {
    const harness = renderStageEditor(openSectionAgainstAResource());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Type in another section' }),
    );

    expect(
      screen.getByRole('switch', { name: 'Search options' }),
    ).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Fuzziness' })).toHaveValue(
      '0.4',
    );
    expect(
      harness.outline().find((section) => section.title === 'Search options')
        ?.state,
    ).not.toBe('Switched off');
  });

  it('still clears when the value itself changes', async () => {
    const harness = renderStageEditor(openSectionAgainstAResource());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );
  });
});
