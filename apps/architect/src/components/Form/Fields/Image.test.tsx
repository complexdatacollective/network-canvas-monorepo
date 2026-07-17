import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/utils/assetUtils', () => ({
  getAssetBlobUrl: vi.fn(async () => 'blob:background-preview'),
  revokeBlobUrl: vi.fn(),
}));

import { ImagePreview } from './Image';

describe('ImagePreview', () => {
  it('matches the full-size Interview canvas rendering for background images', async () => {
    const { container } = render(
      <ImagePreview id="background-asset" canvasBackground />,
    );

    const preview = container.firstElementChild;
    expect(preview).toHaveClass(
      'bg-background',
      'h-[30vh]',
      'w-full',
      'overflow-hidden',
      'rounded',
    );
    expect(preview).toHaveAttribute('data-theme-interview');
    expect(preview).not.toHaveClass('bg-rich-black');
    expect(preview).not.toHaveClass('p-5');

    const image = await waitFor(() => {
      const resolvedImage = container.querySelector('img');
      expect(resolvedImage).not.toBeNull();
      return resolvedImage;
    });

    expect(image?.parentElement).toHaveClass('size-full');
    expect(image).toHaveAttribute('src', 'blob:background-preview');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveClass('size-full', 'object-contain', 'object-center');
  });
});
