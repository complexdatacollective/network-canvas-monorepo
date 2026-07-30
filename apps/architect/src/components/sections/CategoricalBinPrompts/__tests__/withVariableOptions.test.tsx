import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { compose } from 'react-recompose';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import withVariableOptions from '../withVariableOptions';

// Final-review fix: this HOC's `variableOptions` pool is role-filtered for
// the WRITER pickers (bin `variable`, geospatial `variable`), but it ALSO
// used to feed getSortOrderOptionGetter — and sort keys are untagged
// read-only references, deliberately OUTSIDE the writer-exclusivity rule. The
// HOC therefore now exposes the raw pool as `sortVariableOptions`, and this
// test pins the discriminating pair: a form-used variable REMAINS available
// as a sort key while being excluded from the writer picker.
type CapturedProps = {
  variableOptions?: { value: string }[];
  otherVariableOptions?: { value: string }[];
  sortVariableOptions?: { value: string }[];
};

let captured: CapturedProps | undefined;
const Capture = (props: CapturedProps) => {
  captured = props;
  return null;
};

// `cat` is written both by an AlterForm field (validated, stage s1) and by a
// CategoricalBin prompt (unvalidated, stage s2) — the same fixture shape
// pickerExclusions.test.ts uses.
const PROTOCOL = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'cat', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
  ],
};

const renderWithProtocol = (protocol: unknown): CapturedProps => {
  captured = undefined;
  const Harness = compose<
    CapturedProps,
    { form: string; entity: string; type: string }
  >(withVariableOptions)(Capture);
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      form: (state = {}) => state,
    },
  });
  render(
    <Provider store={store}>
      <Harness form="editable-list-form" entity="node" type="person" />
    </Provider>,
  );
  if (!captured) throw new Error('props were not captured');
  return captured;
};

const values = (options?: { value: string }[]) =>
  (options ?? []).map((option) => option.value);

describe('withVariableOptions writer pool vs sort pool', () => {
  it('excludes a form-used variable from the writer pool but keeps it in the sort pool', () => {
    const props = renderWithProtocol(PROTOCOL);

    expect(values(props.variableOptions)).not.toContain('cat');
    expect(values(props.sortVariableOptions)).toContain('cat');
  });

  it('keeps a variable with only same-class (bin) use in both pools', () => {
    const binOnly = { ...PROTOCOL, stages: [PROTOCOL.stages[1]] };
    const props = renderWithProtocol(binOnly);

    expect(values(props.variableOptions)).toContain('cat');
    expect(values(props.sortVariableOptions)).toContain('cat');
  });
});
