import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

// Editor chrome only — `LockedOptions` stays REAL, because whether the editor
// renders it at all is what this file is about. Every `ArchitectField`/
// `ArchitectArrayField` is reduced to its name so the editable option list can
// be asserted absent.
vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Subsection: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('~/components/Form/ArchitectField', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`field-${name}`} />
  ),
}));
vi.mock('~/components/Form/ArchitectArrayField', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`array-field-${name}`} />
  ),
}));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import PromptFields from '../PromptFields';

const READ_ONLY_OPTIONS = [
  { label: 'Weak', value: 'weak' },
  { label: 'Strong', value: 'strong' },
];

/**
 * `readOnly` is stamped by Architect's own new-variable window when it seeds a
 * fixed value set. It is the ONLY locked-options signal that exists before the
 * variable is bound to an interface slot — which is exactly the window in
 * which the researcher can still reach this editor.
 */
const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        strength: {
          name: 'Strength',
          type: 'ordinal',
          readOnly: true,
          options: READ_ONLY_OPTIONS,
        },
        mood: {
          name: 'Mood',
          type: 'ordinal',
          options: READ_ONLY_OPTIONS,
        },
      },
    },
  },
};

const renderFields = (variable: string) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = {
          present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] },
        },
      ) => state,
      stageEditorDraft: (state = { ui: { liveValues: null } }) => state,
    },
  });
  return render(
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true })}>
        <PromptFields entity="node" type="person" variable={variable} />
      </Form>
    </Provider>,
  );
};

describe('OrdinalBinPrompts locked option list', () => {
  it('renders a read-only table for a readOnly codebook attribute', () => {
    renderFields('strength');

    expect(screen.getByText('Weak')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(
      screen.queryByTestId('array-field-variableOptions'),
    ).not.toBeInTheDocument();
  });

  it('leaves an ordinary attribute’s options editable', () => {
    renderFields('mood');

    expect(
      screen.getByTestId('array-field-variableOptions'),
    ).toBeInTheDocument();
  });
});
