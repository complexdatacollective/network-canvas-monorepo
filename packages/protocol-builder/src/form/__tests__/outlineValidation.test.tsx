import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';

const stateOf = (harness: StageEditorHarness, title: string): string =>
  harness.outline().find((section) => section.title === title)?.state ??
  `no section titled "${title}"`;

/**
 * Waits until the session has judged the draft and the outline has been told.
 *
 * Every assertion about a refused stage has to be made after this, and made
 * ONCE — never inside a `waitFor` of its own. Validation is asynchronous, so
 * emptying a required value leaves a window in which the field is already
 * blank and the issue about it has not arrived: a section reads "Not finished"
 * for the field's own reason, which is exactly the answer these tests are
 * looking for, and a retrying assertion takes it and stops. The oracle would
 * then pass with the defect fully present.
 */
async function refusedAndReported(harness: StageEditorHarness): Promise<void> {
  await waitFor(() =>
    expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
  );
  // The session decides first and React hears about it after, so one more
  // flushed turn is what puts the issues in front of the outline.
  await act(async () => {});
}

/**
 * A section that owns exactly one value, so an issue reaching it can only have
 * been attributed by the path that value lives at.
 */
const dataSourceSection = (
  <>
    <BuilderSection title="Data source">
      <ProtocolField
        name="dataSource"
        label="Data source"
        component={InputField}
      />
    </BuilderSection>
    {/* A second section, owning a value the problem is not about. */}
    <BuilderSection title="Stage name">
      <ProtocolField name="label" label="Stage name" component={InputField} />
    </BuilderSection>
  </>
);

/**
 * The outline is built from the form's own field errors — the rules a control
 * can state about itself. A protocol has another kind, which no control can
 * see: a reference to a resource the protocol does not have, a subject naming
 * a type someone else deleted. The save is refused for both, and until now
 * only one of them made the section say so.
 */
describe('a problem only the session can see', () => {
  it('marks the section holding the resource reference that does not resolve', async () => {
    const roster = loadFixtureStage('name-generator-roster-1');
    const harness = renderStageEditor({
      stage: {
        type: roster.type,
        fields: { ...roster.fields, dataSource: 'a_roster_that_was_deleted' },
      },
      sections: dataSourceSection,
    });

    await waitFor(() =>
      expect(stateOf(harness, 'Data source')).toContain('Has a problem'),
    );
    // And what the problem is, not merely that there is one: nothing else on
    // the page can say it, because the control is holding a value it is
    // perfectly happy with.
    expect(stateOf(harness, 'Data source')).toContain(
      'a_roster_that_was_deleted',
    );
    // And only that section. An issue is attributed by the path the problem is
    // at, not spread across everything mounted — a section marked for someone
    // else's problem sends the researcher somewhere there is nothing to fix.
    expect(stateOf(harness, 'Stage name')).toBe('Finished');
  });

  it('stops marking it once the reference resolves again', async () => {
    const roster = loadFixtureStage('name-generator-roster-1');
    const harness = renderStageEditor({
      stage: {
        type: roster.type,
        fields: { ...roster.fields, dataSource: 'a_roster_that_was_deleted' },
      },
      sections: dataSourceSection,
    });
    await waitFor(() =>
      expect(stateOf(harness, 'Data source')).toContain('Has a problem'),
    );

    // Any write that reaches the session — a bound list committing a row, a
    // submit flushing the form — puts the draft back within the protocol's
    // reach.
    act(() => {
      harness.session.dispatch([
        { op: 'set', key: 'dataSource', value: 'roster_data' },
      ]);
    });

    await waitFor(() =>
      expect(stateOf(harness, 'Data source')).toBe('Finished'),
    );
  });

  it('marks the section whose subject names a type a collaborator deleted', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <SubjectSection entity="node" />,
    });
    await waitFor(() => expect(stateOf(harness, 'Node type')).toBe('Finished'));

    harness.receiveCodebookUpdate({ node: { person: null } });

    await waitFor(() =>
      expect(stateOf(harness, 'Node type')).toContain('Has a problem'),
    );
  });

  it('stops marking it when the type comes back', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <SubjectSection entity="node" />,
    });
    const person = {
      name: 'person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      icon: 'Circle',
      variables: {},
    };
    harness.receiveCodebookUpdate({ node: { person: null } });
    await waitFor(() =>
      expect(stateOf(harness, 'Node type')).toContain('Has a problem'),
    );

    harness.receiveCodebookUpdate({ node: { person } });

    await waitFor(() => expect(stateOf(harness, 'Node type')).toBe('Finished'));
  });

  /**
   * A section the researcher cannot type into is not one they can fix
   * anything in, and a stage waiting on a subject has a problem at almost
   * every path it will eventually own. Reporting all of them would bury the
   * one choice that unlocks the rest.
   */
  it('leaves a section that is not available yet saying so', async () => {
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
 * The keys a family pedigree's node configuration must hold, minus the type
 * they are all chosen against. Changing that type throws every one of them
 * away, which is the shape this whole describe is about: a stage arriving with
 * required keys that hold nothing at all.
 */
const NODE_CONFIG_KEYS = [
  'nodeLabelVariable',
  'egoVariable',
  'relationshipVariable',
  'biologicalSexVariable',
] as const;

const nodeConfigSections = (
  <>
    <BuilderSection title="Family member data">
      {NODE_CONFIG_KEYS.map((key) => (
        <ProtocolField
          key={key}
          name={`nodeConfig.${key}`}
          label={key}
          component={InputField}
          required
        />
      ))}
    </BuilderSection>
    {/* A second section, holding a value none of it is about. */}
    <BuilderSection title="Census prompt">
      <ProtocolField
        name="censusPrompt"
        label="Census prompt"
        component={InputField}
      />
    </BuilderSection>
  </>
);

/**
 * A required key the draft simply does not have.
 *
 * The researcher reaches this by ordinary editing — a reset that throws a
 * configuration away, a collaborator unsetting a key, a stage arriving without
 * one — and the schema's account of it is that a value it expected is not
 * there. That is what an empty required field IS, so it has to read as one:
 * anything else asks the researcher to interpret the validator.
 */
describe('a required value the draft no longer holds', () => {
  it('reads as unfinished rather than as a problem', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <StageNameSection />,
    });
    await waitFor(() =>
      expect(stateOf(harness, 'Stage name')).toBe('Finished'),
    );

    act(() => {
      harness.session.dispatch([{ op: 'unset', key: 'label' }]);
    });

    await refusedAndReported(harness);
    expect(stateOf(harness, 'Stage name')).toBe('Not finished');
  });

  it('says so about every key a reset threw away, and about nothing else', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: nodeConfigSections,
    });
    await waitFor(() =>
      expect(stateOf(harness, 'Family member data')).toBe('Finished'),
    );

    act(() => {
      harness.session.dispatch(
        NODE_CONFIG_KEYS.map((key) => ({
          op: 'unset' as const,
          key: ['nodeConfig', key],
        })),
      );
    });

    await refusedAndReported(harness);
    expect(stateOf(harness, 'Family member data')).toBe('Not finished');
    expect(stateOf(harness, 'Census prompt')).toBe('Finished');
  });

  it('asks for it in the package’s own words when the researcher saves', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: nodeConfigSections,
    });
    await waitFor(() =>
      expect(stateOf(harness, 'Family member data')).toBe('Finished'),
    );

    act(() => {
      harness.session.dispatch([
        { op: 'unset', key: ['nodeConfig', 'egoVariable'] },
      ]);
    });
    await refusedAndReported(harness);

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findAllByText('This field is required.'),
    ).not.toHaveLength(0);
  });
});

/**
 * The other half of the same rule. A value that is WRONG rather than missing is
 * a problem, and it is still not the validator's to describe: "Too big:
 * expected number to be <=22" is a sentence about a schema, and the researcher
 * is looking at a zoom control.
 */
describe('a value the schema refuses', () => {
  it('is a problem, said in the editor’s own words', async () => {
    const harness = renderStageEditor({
      stageId: 'geospatial-1',
      sections: (
        <BuilderSection title="Map">
          <ProtocolField
            name="mapOptions.initialZoom"
            label="Starting zoom"
            component={InputField}
            required
          />
        </BuilderSection>
      ),
    });
    await waitFor(() => expect(stateOf(harness, 'Map')).toBe('Finished'));

    // Past the maximum the schema allows, which no control on the page refuses.
    act(() => {
      harness.session.dispatch([
        { op: 'set', key: ['mapOptions', 'initialZoom'], value: 99 },
      ]);
    });

    await refusedAndReported(harness);
    expect(stateOf(harness, 'Map')).toBe(
      'Has a problem. Starting zoom holds more than this stage allows.',
    );
  });
});
