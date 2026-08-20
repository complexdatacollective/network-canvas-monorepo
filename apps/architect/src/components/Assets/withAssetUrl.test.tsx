import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getAssetBlobUrl = vi.fn<(id: string) => Promise<string | null>>();
const revokeBlobUrl = vi.fn<(url: string) => void>();

vi.mock('~/utils/assetUtils', () => ({
  getAssetBlobUrl: (id: string) => getAssetBlobUrl(id),
  revokeBlobUrl: (url: string) => revokeBlobUrl(url),
}));
vi.mock('~/utils/reportError', () => ({ reportError: vi.fn() }));

import withAssetUrl from './withAssetUrl';

// Holds the read open so an unmount or an id change can happen while the URL
// has been minted but not yet handed to anyone.
function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const Shown = ({ url }: { url?: string }) => <span>{url ?? 'no-url'}</span>;
const Wrapped = withAssetUrl(Shown);

// #805 was filed against this file: `getAssetBlobUrl` mints the object URL
// before its IndexedDB read resolves, so a component that unmounts (or changes
// id) inside that window would never revoke it. The guard has since landed —
// these pin it, because nothing else covers this wrapper and the described
// leak would return silently.
describe('withAssetUrl', () => {
  it('revokes a URL that arrives after the component unmounted', async () => {
    const read = defer<string | null>();
    getAssetBlobUrl.mockReset().mockReturnValue(read.promise);
    revokeBlobUrl.mockReset();

    const { unmount } = render(<Wrapped id="a1" />);
    unmount();
    read.resolve('blob:late');

    await waitFor(() =>
      expect(revokeBlobUrl).toHaveBeenCalledWith('blob:late'),
    );
  });

  it('revokes a URL that arrives after the id changed, and keeps the new one', async () => {
    const first = defer<string | null>();
    const second = defer<string | null>();
    getAssetBlobUrl
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    revokeBlobUrl.mockReset();

    const { rerender, findByText } = render(<Wrapped id="a1" />);
    rerender(<Wrapped id="a2" />);

    first.resolve('blob:stale');
    await waitFor(() =>
      expect(revokeBlobUrl).toHaveBeenCalledWith('blob:stale'),
    );

    second.resolve('blob:current');
    expect(await findByText('blob:current')).toBeInTheDocument();
    expect(revokeBlobUrl).not.toHaveBeenCalledWith('blob:current');
  });

  it('revokes the URL it is showing when it unmounts', async () => {
    getAssetBlobUrl.mockReset().mockResolvedValue('blob:shown');
    revokeBlobUrl.mockReset();

    const { findByText, unmount } = render(<Wrapped id="a1" />);
    expect(await findByText('blob:shown')).toBeInTheDocument();

    unmount();

    expect(revokeBlobUrl).toHaveBeenCalledWith('blob:shown');
  });
});
