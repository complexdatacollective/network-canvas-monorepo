import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProjectNav from '../ProjectNav/ProjectNav';

// Mock wouter's useLocation but keep the real Link so anchors render with proper hrefs
const mockNavigate = vi.fn();
const mockLocation = vi.fn(() => '/protocol');

vi.mock('wouter', async () => {
  const actual = await vi.importActual<typeof import('wouter')>('wouter');
  return {
    ...actual,
    useLocation: () => [mockLocation(), mockNavigate],
  };
});

const createTestStore = () =>
  configureStore({
    reducer: {
      activeProtocol: (
        state = { past: [], present: { name: 'Test' }, future: [] },
      ) => state,
    },
  });

type TestStore = ReturnType<typeof createTestStore>;

const wrap = (store: TestStore) => {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

describe('<ProjectNav />', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockLocation.mockReturnValue('/protocol');
  });

  it('marks the active tab based on current location', () => {
    mockLocation.mockReturnValue('/protocol/codebook');
    const store = createTestStore();
    render(<ProjectNav />, { wrapper: wrap(store) });

    const codebookTab = screen.getByRole('link', { name: /codebook/i });
    expect(codebookTab).toHaveAttribute('aria-current', 'page');

    const stagesTab = screen.getByRole('link', { name: /stages/i });
    expect(stagesTab).not.toHaveAttribute('aria-current');
  });

  it('renders tabs as anchors pointing at their routes', () => {
    const store = createTestStore();
    render(<ProjectNav />, { wrapper: wrap(store) });

    expect(screen.getByRole('link', { name: /resources/i })).toHaveAttribute(
      'href',
      '/protocol/assets',
    );
  });
});
