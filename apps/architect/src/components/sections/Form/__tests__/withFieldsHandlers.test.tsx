import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

// Standing in for the codebook: three text variables (all have input controls,
// so all three survive the pre-existing VARIABLE_TYPES_WITH_COMPONENTS filter)
// plus a layout variable that never does. Each selector returns a stable
// reference so useSelector sees an unchanged result across re-renders.
vi.mock('~/selectors/codebook', () => {
  const variables = {
    v1: { name: 'alpha', type: 'text', component: 'TextInput' },
    v2: { name: 'beta', type: 'text', component: 'TextInput' },
    v3: { name: 'gamma', type: 'text', component: 'TextInput' },
    v4: { name: 'delta', type: 'layout' },
  };
  const options = [
    { label: 'alpha', value: 'v1', type: 'text' },
    { label: 'beta', value: 'v2', type: 'text' },
    { label: 'gamma', value: 'v3', type: 'text' },
    { label: 'delta', value: 'v4', type: 'layout' },
  ];
  return {
    getVariablesForSubjectSelector: () => variables,
    getVariableOptionsForSubjectSelector: () => options,
  };
});

// Standing in for the role map: this suite is only concerned with the
// sibling-field exclusion below, so the role-based exclusion is a passthrough
// here. Its own behaviour is covered by
// `src/components/sections/__tests__/pickerExclusions.test.ts`.
vi.mock('~/selectors/roleFilters', () => ({
  excludeUnvalidatedUses: (
    _state: unknown,
    _subject: unknown,
    options: unknown[],
  ) => options,
}));

import { useFieldHandlers } from '../withFieldsHandlers';

type RenderArgs = {
  values?: Record<string, unknown>;
  siblingFields?: unknown;
  editIndex?: number;
};

const renderFieldHandlers = ({
  values = {},
  siblingFields,
  editIndex,
}: RenderArgs = {}) => {
  const store = configureStore({
    reducer: () => ({ form: { 'attr-edit': { values } } }),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(
    () =>
      useFieldHandlers({
        form: 'attr-edit',
        entity: 'node',
        type: 'person',
        siblingFields,
        editIndex,
      }),
    { wrapper },
  );
};

const offeredVariables = (args?: RenderArgs) =>
  renderFieldHandlers(args).result.current.variableOptions.map(
    (option) => option.value,
  );

describe('useFieldHandlers variable options', () => {
  it('does not offer a variable a sibling composer field already collects', () => {
    expect(
      offeredVariables({ siblingFields: [{ variable: 'v2' }] }),
    ).not.toContain('v2');
  });

  it('still offers a variable no sibling composer field collects', () => {
    const offered = offeredVariables({ siblingFields: [{ variable: 'v2' }] });
    expect(offered).toContain('v1');
    expect(offered).toContain('v3');
  });

  it('does not exclude the edited row’s own variable', () => {
    // Row 0 claims v1 and row 1 claims v2; editing row 0 must still offer v1.
    const offered = offeredVariables({
      siblingFields: [{ variable: 'v1' }, { variable: 'v2' }],
      editIndex: 0,
    });
    expect(offered).toContain('v1');
    expect(offered).not.toContain('v2');
  });

  // A picker whose value is absent from its options renders blank and silently
  // drops the selection, so the held value survives even a sibling claiming it
  // — a state the save-time gate rejects, but which the editor must still be
  // able to display and let the researcher correct.
  it('keeps the currently selected variable offered even when a sibling claims it', () => {
    expect(
      offeredVariables({
        values: { variable: 'v2' },
        siblingFields: [{ variable: 'v2' }],
      }),
    ).toContain('v2');
  });

  it('leaves the options untouched when no sibling fields are supplied', () => {
    // The regular Form editor's path: its schema permits two fields naming one
    // variable, so only the input-control filter applies (v4 is a layout
    // variable, which has no input control).
    expect(offeredVariables()).toEqual(['v1', 'v2', 'v3']);
    expect(offeredVariables({ values: { variable: 'v2' } })).toEqual([
      'v1',
      'v2',
      'v3',
    ]);
  });
});
