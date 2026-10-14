import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LocaleTag } from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import {
  type DynamicMessageSite,
  DynamicMessageSummary,
} from '../DynamicTextField.tsx';

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };
const LOCALE: LocaleTag = 'en';

const SITE: Pick<DynamicMessageSite, 'context' | 'bindings'> = {
  context: {
    roles: new Set(),
    variablesFor: () => undefined,
    notYetWritten: undefined,
  },
  bindings: {},
};

const renderSummary = (message: string, markdown: boolean) =>
  render(
    <ProtocolLocalizationProvider localization={ENGLISH}>
      <div data-testid="summary">
        <DynamicMessageSummary
          message={message}
          markdown={markdown}
          locale={LOCALE}
          site={SITE}
        />
      </div>
    </ProtocolLocalizationProvider>,
  );

describe('DynamicMessageSummary', () => {
  it('keeps the emphasis and links of markdown around its values', () => {
    const { getByTestId } = renderSummary(
      'Read **{name}** at [this site](https://example.com) with _{place}_',
      true,
    );
    const summary = getByTestId('summary');

    const strong = summary.querySelector('strong');
    expect(strong?.querySelector('[data-token="name"]')).toHaveTextContent(
      'name',
    );
    const link = summary.querySelector('a');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveTextContent('this site');
    expect(
      summary.querySelector('em [data-token="place"]'),
    ).toBeInTheDocument();
    expect(summary).toHaveTextContent('Read name at this site with place');
    expect(summary.textContent).not.toMatch(/[\u{F0000}-\u{FFFFD}]/u);
  });

  it('draws a plural number as its pill inside formatting', () => {
    const { getByTestId } = renderSummary(
      '{n, plural, one {**#** friend} other {**#** friends}}',
      true,
    );
    expect(
      getByTestId('summary').querySelectorAll('strong [data-token="n"]'),
    ).toHaveLength(2);
  });

  it('shows plain text as written, with its values as pills', () => {
    const { getByTestId } = renderSummary('Hi **{name}**', false);
    const summary = getByTestId('summary');
    expect(summary.querySelector('strong')).toBe(null);
    expect(summary.textContent).toBe('Hi **name**');
    expect(summary.querySelector('[data-token="name"]')).toBeInTheDocument();
  });
});
