import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '../SyntheticInterview';

/**
 * The builder validated a variable's synthetic metadata on its own, where a
 * window is just a window and a probability just a probability. Only the PAIR
 * says otherwise: a NetworkComposer field's control is what the generated
 * values actually obey, so a declared range the field's window cannot reach is
 * metadata that never takes effect.
 *
 * The protocol record refinement already rejected exactly this. The builder
 * now calls that same exported check rather than deriving its own, so the two
 * surfaces cannot disagree again.
 */
describe('builder metadata against its composer renderings', () => {
  it('refuses a datetime range the composer field can never draw', () => {
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const name = person.addVariable({ type: 'text', name: 'name' });
    const layout = person.addVariable({ type: 'layout', name: 'Layout' });
    const dob = person.addVariable({
      type: 'datetime',
      name: 'dateOfBirth',
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
    // The field pins the window to a decade the declared range cannot reach.
    stage.addNodeFormField({
      variable: dob.id,
      component: 'DatePicker',
      parameters: { type: 'full', min: '2000-01-01', max: '2001-12-31' },
    });

    expect(() => si.getNetwork()).toThrow(/NetworkComposer field/);
  });

  it('accepts a range the composer field can reach', () => {
    // The control still narrows the window — it is the disjoint case that is
    // unreachable, not any override at all.
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const name = person.addVariable({ type: 'text', name: 'name' });
    const layout = person.addVariable({ type: 'layout', name: 'Layout' });
    const dob = person.addVariable({
      type: 'datetime',
      name: 'dateOfBirth',
      component: 'DatePicker',
      parameters: { type: 'full' },
      synthetic: {
        distribution: 'uniform',
        min: '2000-06-01',
        max: '2001-06-01',
      },
    });

    const stage = si.addStage('NetworkComposer', {
      subject: { entity: 'node', type: person.id },
      quickAdd: name.id,
      layoutVariable: layout.id,
    });
    stage.addNodeFormField({
      variable: dob.id,
      component: 'DatePicker',
      parameters: { type: 'full', min: '2000-01-01', max: '2001-12-31' },
    });

    expect(() => si.getNetwork()).not.toThrow();
  });
});
