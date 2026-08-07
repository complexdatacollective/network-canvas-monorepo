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

const scalarVariable = {
  name: 'Closeness',
  type: 'scalar',
  component: 'VisualAnalogScale',
  synthetic: { distribution: 'uniform', min: 0.2, max: 0.6 },
} as const satisfies Variable;

describe('SyntheticSection', () => {
  it('registers the scalar uniform bounds', () => {
    render(
      <Form onSubmit={() => ({ success: true as const })}>
        <SyntheticSection context={contextFor(scalarVariable)} />
      </Form>,
    );

    expect(
      document.querySelector(`[name="${syntheticField('min')}"]`),
    ).not.toBeNull();
    expect(
      document.querySelector(`[name="${syntheticField('max')}"]`),
    ).not.toBeNull();
  });
});
