import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ALLOWED_MARKDOWN_SECTION_TAGS } from '@codaco/fresco-ui/RenderMarkdown';
import type { LocaleTag } from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../../localization/ProtocolLocalization.tsx';
import {
  type DynamicMessageSite,
  DynamicMessageSummary,
} from '../../DynamicTextField.tsx';
import { createAssetBlockImages } from '../assetBlockImages.tsx';
import { messages } from '../assetBlockMessages.ts';

const UNUSABLE = messages.unusable.defaultMessage;

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };
const LOCALE: LocaleTag = 'en';
const SITE: Pick<DynamicMessageSite, 'context' | 'bindings'> = {
  context: { roles: new Set(), variablesFor: () => undefined },
  bindings: {},
};

const ASSETS = {
  a1: { kind: 'image', name: 'harbour.png' },
  b2: { kind: 'audio', name: 'song.mp3' },
} as const;

const images = createAssetBlockImages((assetId) =>
  assetId === 'a1' || assetId === 'b2' ? ASSETS[assetId] : undefined,
);

describe('createAssetBlockImages', () => {
  it('matches an address naming a file of the protocol, and nothing else', () => {
    expect(images.matches('asset:a1')).toBe(true);
    expect(images.matches('asset:a1?size=small')).toBe(true);
    expect(images.matches('https://example.org/a.png')).toBe(false);
  });

  const { Block } = images;

  it('names a file by its description, marked with its kind for a screen reader', () => {
    const { container } = render(<Block url="asset:a1" alt="A map" />);
    const line = container.querySelector('[data-asset-block]');
    expect(line).toHaveAttribute('data-asset-block', 'image');
    expect(line).toHaveTextContent('image: A map');
    expect(line?.querySelector('.sr-only')).toHaveAttribute('lang', 'en');
    expect(line?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names a file with no description by the file’s own name', () => {
    const { container } = render(<Block url="asset:b2" alt="   " />);
    expect(container.querySelector('[data-asset-block]')).toHaveAttribute(
      'data-asset-block',
      'audio',
    );
    expect(container.querySelector('bdi')).toHaveTextContent('song.mp3');
  });

  it('reads the file from the address however it is spelled', () => {
    const { container } = render(
      <Block url="asset:a1?size=small&align=end" alt="" />,
    );
    expect(container.querySelector('bdi')).toHaveTextContent('harbour.png');
  });

  it('says so for a file the protocol does not hold', () => {
    const { container } = render(<Block url="asset:gone" alt="Lost" />);
    expect(screen.getByText(UNUSABLE)).toBeInTheDocument();
    expect(container.querySelector('[data-asset-block]')).toHaveAttribute(
      'data-asset-block',
      '',
    );
    expect(container).not.toHaveTextContent('Lost');
  });

  it('strips the private-use characters a description may carry', () => {
    const { container } = render(
      <Block url="asset:a1" alt={'A \u{F0001}map'} />,
    );
    expect(container.textContent).toBe('image: A map');
  });
});

describe('a message summary holding a value and a block', () => {
  const renderSummary = (
    message: string,
    blockImages: typeof images | undefined,
  ) =>
    render(
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <div data-testid="summary">
          <DynamicMessageSummary
            message={message}
            markdown
            multiline
            locale={LOCALE}
            site={SITE}
            blockMarkdown={{
              allowedElements: ALLOWED_MARKDOWN_SECTION_TAGS,
              ...(blockImages !== undefined && { blockImages }),
            }}
          />
        </div>
      </ProtocolLocalizationProvider>,
    );

  const MESSAGE =
    'Hello {name}\n\n![A map](asset:a1)\n\n![](asset:b2)\n\n![](asset:gone)';

  it('draws the value’s pill and each block’s line', () => {
    const { getByTestId } = renderSummary(MESSAGE, images);
    const summary = getByTestId('summary');

    expect(summary.querySelector('[data-token="name"]')).toBeInTheDocument();
    const lines = [...summary.querySelectorAll('[data-asset-block]')];
    expect(lines.map((line) => line.getAttribute('data-asset-block'))).toEqual([
      'image',
      'audio',
      '',
    ]);
    expect(summary).toHaveTextContent('image: A map');
    expect(summary).toHaveTextContent('song.mp3');
    expect(summary).toHaveTextContent(UNUSABLE);
    expect(summary.textContent).not.toMatch(/[\u{F0000}-\u{FFFFD}]/u);
    expect(summary.textContent).not.toContain('asset:');
  });

  it('draws the block of a text that holds nothing else', () => {
    const { getByTestId } = renderSummary('![A map](asset:a1)', images);
    const summary = getByTestId('summary');

    expect(
      summary.querySelector('[data-asset-block="image"]'),
    ).toHaveTextContent('image: A map');
  });

  it('draws no block when the host gives none', () => {
    const { getByTestId } = renderSummary(MESSAGE, undefined);
    const summary = getByTestId('summary');

    expect(summary.querySelector('[data-token="name"]')).toBeInTheDocument();
    expect(summary.querySelector('[data-asset-block]')).toBeNull();
  });
});
