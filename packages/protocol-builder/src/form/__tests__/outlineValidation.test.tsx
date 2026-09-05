import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
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
