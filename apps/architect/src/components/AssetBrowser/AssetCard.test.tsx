import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ProtocolReadOnlyContext } from '~/hooks/useProtocolReadOnly';

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

describe('AssetCard actions while another tab owns the protocol', () => {
  const renderActions = ({
    readOnly,
    isUnresolved = false,
  }: {
    readOnly: boolean;
    isUnresolved?: boolean;
  }) => {
    const handlers = {
      onDelete: vi.fn(),
      onDownload: vi.fn(),
      onPreview: vi.fn(),
      onReplace: vi.fn(),
    };
    render(
      <ProtocolReadOnlyContext value={readOnly}>
        <AssetCard
          id="resource"
          name="Participants"
          type="network"
          isUnresolved={isUnresolved}
          itemProps={itemProps}
          {...handlers}
        />
      </ProtocolReadOnlyContext>,
    );
    return handlers;
  };

  it('deletes and replaces when the protocol is editable', () => {
    const handlers = renderActions({ readOnly: false, isUnresolved: true });

    const replace = screen.getByRole('button', {
      name: 'Add the file for Participants',
    });
    const remove = screen.getByRole('button', { name: 'Delete Participants' });
    expect(replace).toBeEnabled();
    expect(remove).toBeEnabled();

    fireEvent.click(replace);
    fireEvent.click(remove);
    expect(handlers.onReplace).toHaveBeenCalledExactlyOnceWith('resource');
    expect(handlers.onDelete).toHaveBeenCalledExactlyOnceWith(
      'resource',
      false,
    );
  });

  it('keeps the delete control in place but disabled', () => {
    const handlers = renderActions({ readOnly: true });

    const remove = screen.getByRole('button', { name: 'Delete Participants' });
    expect(remove).toBeDisabled();

    fireEvent.click(remove);
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('keeps the replace control in place but disabled for a missing file', () => {
    const handlers = renderActions({ readOnly: true, isUnresolved: true });

    const replace = screen.getByRole('button', {
      name: 'Add the file for Participants',
    });
    expect(replace).toBeDisabled();

    fireEvent.click(replace);
    expect(handlers.onReplace).not.toHaveBeenCalled();
  });

  it('leaves preview and download working', () => {
    const handlers = renderActions({ readOnly: true });

    const preview = screen.getByRole('button', {
      name: 'Preview Participants',
    });
    const download = screen.getByRole('button', {
      name: 'Download Participants',
    });
    expect(preview).toBeEnabled();
    expect(download).toBeEnabled();

    fireEvent.click(preview);
    fireEvent.click(download);
    expect(handlers.onPreview).toHaveBeenCalledExactlyOnceWith('resource');
    expect(handlers.onDownload).toHaveBeenCalledExactlyOnceWith('resource');
  });
});
