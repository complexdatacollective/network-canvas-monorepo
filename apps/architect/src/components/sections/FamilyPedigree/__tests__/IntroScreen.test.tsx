import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

const mockDispatch = vi.fn();

let mockIntroScreenValue: unknown = undefined;

vi.mock('redux-form', () => ({
  change: (form: string, field: string, value: unknown) => ({
    type: 'redux-form/CHANGE',
    form,
    field,
    value,
  }),
  formValueSelector: () => () => mockIntroScreenValue,
}));

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useSelector: (selector: (state: unknown) => unknown) => selector({}),
    useDispatch: () => mockDispatch,
  };
});

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

let capturedToggleChange: ((state: boolean) => Promise<boolean>) | undefined;

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({
    children,
    title,
    startExpanded,
    handleToggleChange,
    toggleable,
  }: {
    children: React.ReactNode;
    title: string;
    startExpanded?: boolean;
    handleToggleChange?: (state: boolean) => Promise<boolean>;
    toggleable?: boolean;
  }) => {
    if (toggleable && handleToggleChange) {
      capturedToggleChange = handleToggleChange;
    }
    return (
      <div>
        <h2>{title}</h2>
        {toggleable && (
          <button
            data-testid="section-toggle"
            data-expanded={startExpanded ? 'true' : 'false'}
            onClick={() => handleToggleChange?.(!startExpanded)}
          >
            Toggle
          </button>
        )}
        {startExpanded && children}
      </div>
    );
  },
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    component,
    componentProps,
    label,
  }: {
    name: string;
    component: ComponentType<Record<string, unknown>>;
    componentProps?: Record<string, unknown>;
    label?: string;
  }) => createElement(component, { ...componentProps, label, name }),
}));

vi.mock('~/components/Form/Fields/Text', () => ({
  default: () => <div data-testid="text-field" />,
}));

let capturedArrayFieldProps: Record<string, unknown> | undefined;

vi.mock('~/components/Form/DialogArrayField', () => ({
  default: (props: Record<string, unknown>) => {
    capturedArrayFieldProps = props;
    const items = (
      mockIntroScreenValue as { items?: unknown[] } | null | undefined
    )?.items;

    return (
      <div data-testid={`dialog-array-field-${String(props.name)}`}>
        {!items?.length && String(props.emptyStateMessage)}
        <button>Create new</button>
      </div>
    );
  },
}));

vi.mock('~/components/sections/ContentGrid/ItemEditor', () => ({
  default: () => <div data-testid="item-editor" />,
}));

vi.mock('~/components/sections/ContentGrid/ItemPreview', () => ({
  default: () => <div data-testid="item-preview" />,
}));

import IntroScreen from '../IntroScreen';

const renderSection = () => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      <IntroScreen
        form="edit-stage"
        stagePath={null}
        interfaceType="FamilyPedigree"
      />
    </Provider>,
  );
};

describe('IntroScreen', () => {
  it('renders a toggle when introScreen is not set', () => {
    mockIntroScreenValue = undefined;
    renderSection();
    expect(screen.getByTestId('section-toggle')).toBeDefined();
  });

  it('section starts collapsed when introScreen is undefined', () => {
    mockIntroScreenValue = undefined;
    renderSection();
    expect(screen.getByTestId('section-toggle').dataset.expanded).toBe('false');
  });

  it('section starts expanded when introScreen has a value', () => {
    mockIntroScreenValue = { items: [] };
    renderSection();
    expect(screen.getByTestId('section-toggle').dataset.expanded).toBe('true');
  });

  it('shows the content-item list when enabled', () => {
    mockIntroScreenValue = { items: [] };
    renderSection();
    expect(
      screen.getByTestId('dialog-array-field-introScreen.items'),
    ).toBeDefined();
  });

  it('configures content items for dialog editing', () => {
    mockIntroScreenValue = { items: [] };
    renderSection();

    expect(capturedArrayFieldProps).toMatchObject({
      name: 'introScreen.items',
      label: 'Content sections',
      addTitle: 'Edit Section',
      editorTitle: 'Edit Section',
      itemLabel: 'content section',
      requestedEditFormName: 'editable-list-form',
      sortable: true,
    });
    expect(capturedArrayFieldProps?.normalizeItem).toBeTypeOf('function');
    expect(capturedArrayFieldProps?.itemSelector).toBeTypeOf('function');
  });

  it('shows an empty-state message when there are no items', () => {
    mockIntroScreenValue = { items: [] };
    renderSection();
    expect(
      screen.getByText(/No content sections have been created yet/),
    ).toBeDefined();
  });

  it('hides the empty-state message when items exist', () => {
    mockIntroScreenValue = {
      items: [{ id: 't1', type: 'text', content: 'Hello' }],
    };
    renderSection();
    expect(
      screen.queryByText(/No content sections have been created yet/),
    ).toBeNull();
  });

  it('dispatches change to an empty items list when toggled on', async () => {
    mockIntroScreenValue = undefined;
    mockDispatch.mockClear();
    renderSection();

    expect(capturedToggleChange).toBeTypeOf('function');
    await capturedToggleChange?.(true);

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'redux-form/CHANGE',
        field: 'introScreen',
        value: { items: [] },
      }),
    );
  });

  it('dispatches change to null when toggled off', async () => {
    mockIntroScreenValue = { items: [] };
    mockDispatch.mockClear();
    renderSection();

    expect(capturedToggleChange).toBeTypeOf('function');
    await capturedToggleChange?.(false);

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'redux-form/CHANGE',
        field: 'introScreen',
        value: null,
      }),
    );
  });
});
