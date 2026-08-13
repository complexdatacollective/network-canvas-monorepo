import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import type { Variable } from '@codaco/protocol-validation';

import { type SyntheticDraftContext, syntheticField } from './syntheticDraft';
import SyntheticSection from './SyntheticSection';

const contextFor = (variable: Variable): SyntheticDraftContext => ({
  variable,
  options: [],
  required: false,
});

const scalarUniform = {
  name: 'Closeness',
  type: 'scalar',
  component: 'VisualAnalogScale',
  synthetic: { distribution: 'uniform', min: 0.2, max: 0.6 },
} as const satisfies Variable;

// The scalar normal and beta schemas are strict objects WITHOUT min/max, so a
// bound entered against either makes the variable unsavable.
const scalarNormal = {
  name: 'Closeness',
  type: 'scalar',
  component: 'VisualAnalogScale',
  synthetic: { distribution: 'normal', mean: 0.5, sd: 0.1 },
} as const satisfies Variable;

const numberUniform = {
  name: 'Age',
  type: 'number',
  component: 'Number',
  synthetic: { distribution: 'uniform', min: 18, max: 80 },
} as const satisfies Variable;

const numberNormal = {
  name: 'Age',
  type: 'number',
  component: 'Number',
  synthetic: { distribution: 'normal', mean: 40, sd: 12 },
} as const satisfies Variable;

const boundFields = () => ({
  min: document.querySelector(`[name="${syntheticField('min')}"]`),
  max: document.querySelector(`[name="${syntheticField('max')}"]`),
});

describe('SyntheticSection', () => {
  const mount = (variable: Variable) =>
    render(
      <Form onSubmit={() => ({ success: true as const })}>
        <SyntheticSection context={contextFor(variable)} />
      </Form>,
    );

  it('registers the scalar uniform bounds', () => {
    mount(scalarUniform);
    const { min, max } = boundFields();
    expect(min).not.toBeNull();
    expect(max).not.toBeNull();
  });

  it('offers no bounds for a scalar normal, which cannot store them', () => {
    mount(scalarNormal);
    const { min, max } = boundFields();
    expect(min).toBeNull();
    expect(max).toBeNull();
  });

  it('marks a number uniform’s bounds required, since the schema demands them', () => {
    mount(numberUniform);
    const { min, max } = boundFields();
    // fresco-ui marks a required field for assistive tech rather than with the
    // native attribute, since the form submits with `noValidate`.
    expect(min?.getAttribute('aria-required')).toBe('true');
    expect(max?.getAttribute('aria-required')).toBe('true');
  });

  it('leaves a number normal’s bounds optional, since the schema allows either', () => {
    mount(numberNormal);
    const { min, max } = boundFields();
    expect(min?.getAttribute('aria-required')).toBe('false');
    expect(max?.getAttribute('aria-required')).toBe('false');
  });

  it('still offers them for a number normal, which can', () => {
    mount(numberNormal);
    const { min, max } = boundFields();
    expect(min).not.toBeNull();
    expect(max).not.toBeNull();
  });
});
