import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import withAssets from './withAssets';

const protocol = {
  schemaVersion: 9,
  name: 'test',
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  codebook: { node: {} },
  assetManifest: {
    a: { id: 'a', type: 'image', name: 'a.png' },
    b: { id: 'b', type: 'audio', name: 'b.mp3' },
    c: { id: 'c', type: 'video', name: 'c.mp4' },
    d: { id: 'd', type: 'image', name: 'd.png' },
    e: { id: 'e', type: 'image', name: 'e.png' },
    f: { id: 'f', type: 'image', name: 'f.png' },
  },
  stages: [
    {
      id: 'info',
      type: 'Information',
      label: { en: 'Info' },
      content: {
        en: '![](asset:a)\n\n![](asset:b)\n\n![](asset:c)\n\nNot shown: `![](asset:e)`',
        fr: '![](asset:d)',
      },
    },
  ],
};

type Listed = { assets: { id: string; isUsed: boolean }[] };

const usage = () => {
  let seen: Listed['assets'] = [];
  const List = ({ assets }: Listed) => {
    seen = assets;
    return null;
  };
  const Wrapped = withAssets(List as never) as unknown as React.ComponentType<{
    assetType: string | null;
    selected: string | null;
  }>;
  const store = configureStore({
    reducer: { activeProtocol: (state = { present: protocol }) => state },
  });
  render(
    <Provider store={store}>
      <Wrapped assetType={null} selected="f" />
    </Provider>,
  );
  return Object.fromEntries(seen.map(({ id, isUsed }) => [id, isUsed]));
};

describe('withAssets', () => {
  it('marks every file shown as a block in an Information text as used, in every language', () => {
    expect(usage()).toMatchObject({ a: true, b: true, c: true, d: true });
  });

  it('marks a file only named in a code span as unused, and the selected file as used', () => {
    expect(usage()).toMatchObject({ e: false, f: true });
  });
});
