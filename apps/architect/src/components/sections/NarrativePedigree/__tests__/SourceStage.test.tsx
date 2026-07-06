import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

const mockStageList = [
  { id: 'stage-1', type: 'FamilyPedigree', label: 'My Family Tree' },
  { id: 'stage-2', type: 'NameGenerator', label: 'Name Generator' },
  { id: 'stage-3', type: 'FamilyPedigree', label: 'Second Pedigree' },
];

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useSelector: (selector: (state: unknown) => unknown) => selector({}),
  };
});

vi.mock('~/selectors/protocol', () => ({
  getStageList: () => mockStageList,
}));

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => vi.fn(),
}));

vi.mock('redux-form', () => ({
  Field: ({
    name,
    label,
    options,
  }: {
    name: string;
    label?: string;
    options?: { value: string; label: string }[];
    component: unknown;
  }) => (
    <div data-testid={`field-${name}`}>
      {label && <span>{label}</span>}
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </div>
  ),
}));

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

import SourceStage from '../SourceStage';

const renderSection = () => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      <SourceStage
        form="edit-stage"
        stagePath={null}
        interfaceType="NarrativePedigree"
      />
    </Provider>,
  );
};

describe('SourceStage', () => {
  it('renders the Source Stage section title', () => {
    renderSection();
    expect(screen.getByText('Source Stage')).toBeDefined();
  });

  it('renders the sourceStageId field', () => {
    renderSection();
    expect(screen.getByTestId('field-sourceStageId')).toBeDefined();
  });

  it('lists only FamilyPedigree stages as options', () => {
    renderSection();
    const field = screen.getByTestId('field-sourceStageId');
    expect(field.textContent).toContain('My Family Tree');
    expect(field.textContent).toContain('Second Pedigree');
    expect(field.textContent).not.toContain('Name Generator');
  });
});
