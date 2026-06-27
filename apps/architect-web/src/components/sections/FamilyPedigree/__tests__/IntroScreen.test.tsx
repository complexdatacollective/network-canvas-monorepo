import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
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
    componentProps,
  }: {
    name: string;
    componentProps?: { label?: string };
  }) => <div data-testid={`field-${name}`}>{componentProps?.label}</div>,
}));

vi.mock('~/components/Form/Fields/RichText', () => ({
  Field: () => <div data-testid="rich-text" />,
}));

vi.mock('~/components/Form/Fields/Text', () => ({
  default: () => <div data-testid="text-field" />,
}));

vi.mock('~/components/Form/Fields/Video', () => ({
  default: () => <div data-testid="video-field" />,
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
    mockIntroScreenValue = { text: 'Hello', title: 'Intro' };
    renderSection();
    expect(screen.getByTestId('section-toggle').dataset.expanded).toBe('true');
  });

  it('shows title and text fields when intro screen is enabled', () => {
    mockIntroScreenValue = { text: 'Hello' };
    renderSection();
    expect(screen.getByTestId('field-introScreen.title')).toBeDefined();
    expect(screen.getByTestId('field-introScreen.text')).toBeDefined();
  });

  it('shows video asset field when intro screen is enabled', () => {
    mockIntroScreenValue = { text: 'Hello' };
    renderSection();
    expect(screen.getByTestId('field-introScreen.videoAssetId')).toBeDefined();
  });

  it('dispatches change to null when toggled off', async () => {
    mockIntroScreenValue = { text: 'Hello' };
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
