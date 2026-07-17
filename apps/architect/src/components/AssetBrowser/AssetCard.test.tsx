import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import Surface from '@codaco/fresco-ui/layout/Surface';

vi.mock('~/utils/assetUtils', () => ({
  getAssetBlobUrl: vi.fn(async () => 'blob:resource-preview'),
  revokeBlobUrl: vi.fn(),
}));

import AssetCard from './AssetCard';

const itemProps: ItemProps = {
  ref: vi.fn(),
  tabIndex: 0,
  role: 'option',
};

const renderCard = (parent?: React.ReactNode) =>
  render(
    parent ?? (
      <AssetCard
        id="resource"
        name="Responsive background"
        type="image"
        itemProps={itemProps}
      />
    ),
  );

describe('AssetCard', () => {
  it('renders image resources responsively with the Interview background', async () => {
    const { getByRole } = renderCard();

    const image = await waitFor(() =>
      getByRole('img', { name: 'Responsive background' }),
    );

    expect(image.parentElement).toHaveAttribute('data-theme-interview');
    expect(image.parentElement).toHaveClass('bg-background', 'size-full');
    expect(image).toHaveClass('size-full', 'object-contain', 'object-center');
  });

  it('derives its shading from the surrounding Surface hierarchy', () => {
    const { getByRole } = renderCard(
      <Surface noContainer spacing="none">
        <AssetCard
          id="resource"
          name="Nested resource"
          type="network"
          itemProps={itemProps}
        />
      </Surface>,
    );

    const card = getByRole('option');
    expect(card).toHaveClass('bg-surface-1', 'text-surface-1-contrast');
    expect(card).not.toHaveClass('bg-surface');
  });
});
