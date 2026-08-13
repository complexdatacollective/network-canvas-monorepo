import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '../SyntheticInterview';

/**
 * The composer-rendering check reads the NetworkComposer stages' own fields,
 * because a declared field is the only thing the protocol record refinement
 * reads and the two surfaces exist to agree.
 *
 * It once read the resolved rendering map instead. That map is fed by every
 * ordinary form as well as by composer fields, and folding two contributions
 * together resolves each side into a closed window — so an open
 * full-resolution DatePicker came back carrying `max: today`, a stand-in
 * ceiling the drawer is meant to replace, with nothing left on it to say so.
 * Judged as a declared bound it refused protocols the record schema accepts
 * and `generateNetwork` generates, in the name of a NetworkComposer field that
 * was never there — and refused them only until the wall clock passed the
 * declared floor.
 */
describe('builder synthetic reachability reads declared composer fields', () => {
  it('builds a protocol with no NetworkComposer and a future date window', () => {
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const plannedDate = person.addVariable({
      type: 'datetime',
      name: 'plannedDate',
      component: 'DatePicker',
      parameters: { type: 'full' },
      synthetic: {
        distribution: 'uniform',
        min: '2030-01-01',
        max: '2035-12-31',
      },
    });

    // Two ordinary forms rendering one variable is what makes the map fold —
    // one contribution alone is stored verbatim and never resolved.
    for (let i = 0; i < 2; i += 1) {
      const stage = si.addStage('NameGenerator', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 3 },
        form: {
          fields: [{ variable: plannedDate.id, component: 'DatePicker' }],
        },
      });
      stage.addPrompt({ text: 'name someone' });
    }

    // The declared window is entirely in the future, so a today-ceiling read as
    // authored puts it out of reach. Nothing here declares that ceiling.
    expect(() => si.getNetwork()).not.toThrow();
    expect(si.getNetwork().nodes.length).toBeGreaterThan(0);
  });

  it('builds where a coarse picker only derives its floor', () => {
    // A year picker's dropdown starts at the 1920 default when no floor is
    // declared. Folded renderings re-emit that as `min`, which read as authored
    // makes an earlier synthetic window unreachable; the variable itself
    // declares no floor at all.
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const foundingYear = person.addVariable({
      type: 'datetime',
      name: 'foundingYear',
      component: 'DatePicker',
      parameters: { type: 'year' },
      synthetic: { distribution: 'uniform', min: '1900', max: '1910' },
    });

    for (let i = 0; i < 2; i += 1) {
      const stage = si.addStage('NameGenerator', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 3 },
        form: {
          fields: [{ variable: foundingYear.id, component: 'DatePicker' }],
        },
      });
      stage.addPrompt({ text: 'name someone' });
    }

    expect(() => si.getNetwork()).not.toThrow();
    expect(si.getNetwork().nodes.length).toBeGreaterThan(0);
  });

  it('still refuses a range a composer edge form can never draw', () => {
    // The edge half of a composer stage declares its fields on the edge entry
    // rather than the stage, and is read from there for the same reason the
    // record refinement checks each form separately.
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const name = person.addVariable({ type: 'text', name: 'name' });
    const layout = person.addVariable({ type: 'layout', name: 'Layout' });
    const friend = si.addEdgeType({ name: 'Friend' });
    const since = friend.addVariable({
      type: 'datetime',
      name: 'since',
      component: 'DatePicker',
      parameters: { type: 'full' },
      synthetic: {
        distribution: 'uniform',
        min: '1950-01-01',
        max: '1960-12-31',
      },
    });

    const stage = si.addStage('NetworkComposer', {
      subject: { entity: 'node', type: person.id },
      quickAdd: name.id,
      layoutVariable: layout.id,
    });
    stage.addEdgeType({
      type: friend.id,
      form: {
        fields: [
          {
            variable: since.id,
            component: 'DatePicker',
            parameters: { type: 'full', min: '2000-01-01', max: '2001-12-31' },
          },
        ],
      },
    });

    expect(() => si.getNetwork()).toThrow(/NetworkComposer field/);
  });
});
