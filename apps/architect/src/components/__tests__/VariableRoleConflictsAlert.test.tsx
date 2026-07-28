import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import VariableRoleConflictsAlert from '../VariableRoleConflictsAlert';

// `category` is written by both a form field (validated) and a bin prompt
// (unvalidated) on the same node type — the conflict shape
// `findVariableRoleConflicts` flags. Mirrors the fixture stages in
// `packages/protocol-validation/src/utils/__tests__/findVariableRoleConflicts.test.ts`.
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        category: {
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Friend', value: 'friend' },
            { label: 'Family', value: 'family' },
          ],
        },
      },
    },
  },
};

const alterFormStage = {
  id: 'af1',
  type: 'AlterForm',
  label: 'Alter form',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'T', text: 'X' },
  form: { fields: [{ variable: 'category', prompt: 'Answer' }] },
};

const categoricalBinStage = {
  id: 'cb1',
  type: 'CategoricalBin',
  label: 'Sort into bins',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Sort', variable: 'category' }],
};

const conflictProtocol = {
  name: 'Test protocol',
  codebook,
  stages: [alterFormStage, categoricalBinStage],
};

const cleanProtocol = {
  name: 'Test protocol',
  codebook,
  stages: [alterFormStage],
};

const createTestStore = (present: unknown) =>
  configureStore({
    reducer: {
      activeProtocol: (state = { present }) => state,
    },
  });

type TestStore = ReturnType<typeof createTestStore>;

const wrap = (store: TestStore) => {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

describe('<VariableRoleConflictsAlert />', () => {
  it('renders nothing when the protocol has no variable role conflicts', () => {
    const store = createTestStore(cleanProtocol);
    const { container } = render(<VariableRoleConflictsAlert />, {
      wrapper: wrap(store),
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('lists a conflicting variable with its validated and unvalidated stage labels', () => {
    const store = createTestStore(conflictProtocol);
    render(<VariableRoleConflictsAlert />, { wrapper: wrap(store) });

    expect(screen.getByText('Category')).toBeInTheDocument();
    const item = screen.getByText('Category').closest('li');
    expect(item).not.toBeNull();
    expect(item).toHaveTextContent('Alter form');
    expect(item).toHaveTextContent('Sort into bins');
  });
});
