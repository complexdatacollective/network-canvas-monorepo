import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GallerySidebar } from '~/components/protocol-gallery/GallerySidebar';
import { renderWithIntl } from '~/test/renderWithIntl';

function renderSidebar(overrides: {
  onToggle?: (value: string) => void;
  onSortChange?: (sort: 'newest' | 'oldest' | 'titleAsc' | 'titleDesc') => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  resultCount?: number;
}) {
  return renderWithIntl(
    <GallerySidebar
      query=""
      onQueryChange={vi.fn()}
      resultCount={overrides.resultCount ?? 7}
      total={7}
      facets={[
        {
          id: 'fields',
          label: 'Field of study',
          options: [
            { value: 'Public health', count: 6 },
            { value: 'Aging', count: 1 },
          ],
          selected: ['Aging'],
          onToggle: overrides.onToggle ?? vi.fn(),
        },
      ]}
      sort="newest"
      onSortChange={overrides.onSortChange ?? vi.fn()}
      hasActiveFilters={overrides.hasActiveFilters ?? false}
      onClearFilters={overrides.onClearFilters ?? vi.fn()}
    />,
  );
}

describe('GallerySidebar', () => {
  afterEach(() => {
    cleanup();
  });

  it('offers to clear every filter only while one is active', () => {
    const onClearFilters = vi.fn();
    renderSidebar({ hasActiveFilters: false, onClearFilters });
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    cleanup();

    renderSidebar({ hasActiveFilters: true, onClearFilters });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('renders facet pills as pressable buttons with their counts', () => {
    const onToggle = vi.fn();
    renderSidebar({ onToggle });

    const publicHealth = screen.getByRole('button', { name: /Public health/ });
    const aging = screen.getByRole('button', { name: /Aging/ });

    expect(publicHealth).toHaveAttribute('aria-pressed', 'false');
    expect(publicHealth).toHaveTextContent('6');
    expect(aging).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(publicHealth);
    expect(onToggle).toHaveBeenCalledWith('Public health');
  });

  it('announces how many protocols match', () => {
    renderSidebar({ resultCount: 5 });

    expect(screen.getByText('5 of 7 protocols')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('changes the sort through a radio group', () => {
    const onSortChange = vi.fn();
    renderSidebar({ onSortChange });

    expect(screen.getByRole('radio', { name: 'Most recent' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Title A–Z' }));
    expect(onSortChange).toHaveBeenCalledWith('titleAsc');
  });
});
