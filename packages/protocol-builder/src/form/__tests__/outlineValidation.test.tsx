import { screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';

const stateOf = (harness: StageEditorHarness, title: string): string =>
  harness.outline().find((section) => section.title === title)?.state ??
  `no section titled "${title}"`;

/**
 * A section the researcher cannot type into is not one they can fix anything
 * in, and a stage waiting on a subject has a problem at almost every path it
 * will eventually own. Reporting all of them would bury the one choice that
 * unlocks the rest.
 */
describe('a section that is not available yet', () => {
  it('says so rather than reporting what it cannot hold', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NameGeneratorRoster',
        fields: { label: 'New stage' },
      },
      sections: (
        <BuilderSection title="Data source" disabled>
          <ProtocolField
            name="dataSource"
            label="Data source"
            component={InputField}
          />
        </BuilderSection>
      ),
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(stateOf(harness, 'Data source')).toBe('Not available yet');
  });
});

/**
 * A required key the researcher has emptied.
 *
 * The schema's account of it is that a value it expected is not there, which
 * is what an empty required field IS — so it has to read as one, in the
 * package's own words rather than the validator's or Fresco's participant-
 * facing copy.
 */
describe('a required value the stage no longer holds', () => {
  it('asks for it in the package’s own words when the researcher saves', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: (
        <BuilderSection title="Family member data">
          <ProtocolField
            name="nodeConfig.egoVariable"
            label="Ego variable"
            component={InputField}
            required
          />
        </BuilderSection>
      ),
    });
    await waitFor(() =>
      expect(stateOf(harness, 'Family member data')).toBe('Finished'),
    );

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Ego variable' }),
    );

    expect(await harness.submit()).toBeNull();
    // Once, beside the control, and in this package's words rather than
    // Fresco's — which address a participant answering an interview.
    expect(screen.getAllByText('This field is required.')).toHaveLength(1);
    // And the section says the researcher has something to do in it, without
    // the validator's own account of a missing string underneath.
    expect(stateOf(harness, 'Family member data')).toBe('Has a problem');
  });
});

/** A control that writes one number, whatever the schema thinks of it. */
const SetZoom = (({
  onChange,
}: Readonly<{ onChange?: (value: unknown) => void }>) => (
  <button type="button" onClick={() => onChange?.(99)}>
    Set the zoom past the maximum
  </button>
)) as ComponentType<Record<string, unknown>>;

/**
 * A value that is WRONG rather than missing is a problem, and it is still not
 * the validator's to describe: "Too big: expected number to be <=22" is a
 * sentence about a schema, and the researcher is looking at a zoom control.
 */
describe('a value the schema refuses', () => {
  const zoomSections = (
    <>
      <BuilderSection title="Map">
        <ProtocolField
          name="mapOptions.initialZoom"
          label="Starting zoom"
          component={SetZoom}
        />
      </BuilderSection>
      {/* A second section, owning a value the problem is not about. */}
      <BuilderSection title="Stage name">
        <ProtocolField name="label" label="Stage name" component={InputField} />
      </BuilderSection>
    </>
  );

  it('is a problem, said in the editor’s own words', async () => {
    const harness = renderStageEditor({
      stageId: 'geospatial-1',
      sections: zoomSections,
    });
    await waitFor(() => expect(stateOf(harness, 'Map')).toBe('Finished'));

    // Past the maximum the schema allows, which no control on the page refuses.
    await harness.user.click(
      screen.getByRole('button', { name: 'Set the zoom past the maximum' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(stateOf(harness, 'Map')).toBe(
      'Has a problem. Starting zoom holds more than this stage allows.',
    );
  });

  it('is reported by the section that holds it and by no other', async () => {
    const harness = renderStageEditor({
      stageId: 'geospatial-1',
      sections: zoomSections,
    });
    await waitFor(() => expect(stateOf(harness, 'Map')).toBe('Finished'));

    await harness.user.click(
      screen.getByRole('button', { name: 'Set the zoom past the maximum' }),
    );
    expect(await harness.submit()).toBeNull();

    // An issue is attributed by the path the problem is at, not spread across
    // everything mounted — a section marked for someone else's problem sends
    // the researcher somewhere there is nothing to fix.
    expect(stateOf(harness, 'Stage name')).toBe('Finished');
  });
});
