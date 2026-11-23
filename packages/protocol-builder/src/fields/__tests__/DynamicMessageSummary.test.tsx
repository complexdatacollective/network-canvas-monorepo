import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  dynamicValuePathFor,
  type LocaleTag,
} from '@codaco/protocol-validation';

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
  },
  bindings: {},
};

const renderSummary = (message: string, markdown: boolean, multiline = false) =>
  render(
    <ProtocolLocalizationProvider localization={ENGLISH}>
      <div data-testid="summary">
        <DynamicMessageSummary
          message={message}
          markdown={markdown}
          multiline={multiline}
          locale={LOCALE}
          site={SITE}
        />
      </div>
    </ProtocolLocalizationProvider>,
  );

describe('DynamicMessageSummary', () => {
  it('keeps the emphasis and links of markdown of several lines around its values', () => {
    const { getByTestId } = renderSummary(
      'Read **{name}** at [this site](https://example.com) with _{place}_',
      true,
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

  it('shows a set of versions as the pill of the value it is on, never its versions', () => {
    const { getByTestId } = renderSummary(
      'You have {n, plural, one {**#** friend} other {**#** friends}}.',
      true,
    );
    const summary = getByTestId('summary');

    expect(summary).toHaveTextContent(/^You have n\.$/);
    expect(summary.querySelectorAll('[data-token]')).toHaveLength(1);
    expect(summary.querySelector('[data-token="n"]')).toHaveTextContent('n');
    expect(summary.textContent).not.toContain('friend');
  });

  it('keeps formatting that opens before a set of versions and closes after it', () => {
    const { getByTestId } = renderSummary(
      '**Hello {name, select, missing {there} other {{name}}} today**',
      true,
    );
    const summary = getByTestId('summary');

    const strong = summary.querySelector('strong');
    expect(strong).toHaveTextContent(/^Hello name today$/);
    expect(strong?.querySelectorAll('[data-token="name"]')).toHaveLength(1);
    expect(summary.textContent).not.toContain('there');
    expect(summary.textContent).not.toContain('**');
    expect(summary.textContent).not.toMatch(/[\u{F0000}-\u{FFFFD}]/u);
  });

  it('keeps the headings, paragraphs and rules of text in a field of several lines', () => {
    const { getByTestId } = renderSummary(
      '## Welcome {name}\n\nFirst paragraph.\n\n---\n\nSecond paragraph.',
      true,
      true,
    );
    const summary = getByTestId('summary');

    expect(summary.querySelector('h2 [data-token="name"]')).toBeInTheDocument();
    expect(summary.querySelectorAll('p')).toHaveLength(2);
    expect(summary.querySelector('hr')).toBeInTheDocument();
  });

  it('draws text in a field on one line as a label, without a paragraph', () => {
    const { getByTestId } = renderSummary('Tell us about **{name}**', true);
    const summary = getByTestId('summary');

    expect(summary.querySelector('p')).toBeNull();
    expect(
      summary.querySelector('strong [data-token="name"]'),
    ).toBeInTheDocument();
  });

  // What the text is drawn as is the field's to say, not the words it holds
  // today.
  it('draws text on one line in a field of several lines as that field draws it', () => {
    const { getByTestId } = renderSummary('Welcome {name}', true, true);

    expect(getByTestId('summary').querySelector('p')).toBeInTheDocument();
  });

  it('draws text over several lines by the rules its host passes', () => {
    const { getByTestId } = render(
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <div data-testid="summary">
          <DynamicMessageSummary
            message={'# Title {name}\n\nBody'}
            markdown
            multiline
            locale={LOCALE}
            site={SITE}
            blockMarkdown={{
              allowedElements: ['p'],
              components: {
                p: ({ children }) => <p data-host="">{children}</p>,
              },
            }}
          />
        </div>
      </ProtocolLocalizationProvider>,
    );
    const summary = getByTestId('summary');

    expect(summary.querySelector('h1')).toBeNull();
    expect(summary.querySelectorAll('p[data-host]')).toHaveLength(1);
    expect(summary).toHaveTextContent(/Title name\s*Body/);
  });

  it('shows plain text as written, with its values as pills', () => {
    const { getByTestId } = renderSummary('Hi **{name}**', false);
    const summary = getByTestId('summary');
    expect(summary.querySelector('strong')).toBe(null);
    expect(summary.textContent).toBe('Hi **name**');
    expect(summary.querySelector('[data-token="name"]')).toBeInTheDocument();
  });
});

describe('DynamicMessageSummary pills', () => {
  it('gives an attribute’s own name its own direction, and the interface’s words the interface’s language', () => {
    const { getByTestId } = render(
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <div data-testid="summary">
          <DynamicMessageSummary
            message="{team} {today}"
            markdown={false}
            multiline={false}
            locale={LOCALE}
            site={{
              context: {
                roles: new Set(['ego']),
                variablesFor: (role) =>
                  role === 'ego'
                    ? { v1: { name: 'team-b!', type: 'text' } }
                    : undefined,
              },
              bindings: {
                team: { path: dynamicValuePathFor('ego', 'v1') },
                today: { path: 'now' },
              },
            }}
          />
        </div>
      </ProtocolLocalizationProvider>,
    );
    const summary = getByTestId('summary');

    // The researcher's name, which reads in its own direction whatever the
    // interface's is.
    const attribute = summary.querySelector('[data-token="team"]');
    expect(attribute).toHaveTextContent('team-b!');
    expect(attribute).toHaveAttribute('dir', 'auto');
    expect(attribute).not.toHaveAttribute('lang');

    // A value the interface names, in the interface's language.
    const today = summary.querySelector('[data-token="today"]');
    expect(today).toHaveAttribute('lang', 'en');
    expect(today).toHaveAttribute('dir', 'ltr');
  });
});
