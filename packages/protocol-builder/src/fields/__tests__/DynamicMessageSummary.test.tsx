import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  dynamicValueNameFor,
  type LocaleTag,
} from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import { testVariableId } from '../../testing/testId.ts';
import { DynamicMessageSummary } from '../dynamicText/DynamicMessageSummary.tsx';
import type { DynamicMessageSite } from '../dynamicText/messageSite.ts';

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };
const LOCALE: LocaleTag = 'en';

const SITE: Pick<DynamicMessageSite, 'context'> = {
  context: {
    roles: new Set(),
    variablesFor: () => undefined,
  },
};

const TEAM_ID = testVariableId('team');
const TEAM = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: TEAM_ID,
});

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
    expect(strong?.querySelector('data[value="name"]')).toHaveTextContent(
      'name',
    );
    const link = summary.querySelector('a');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveTextContent('this site');
    expect(summary.querySelector('em data[value="place"]')).toBeInTheDocument();
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
    expect(
      summary.querySelectorAll('data[data-variable-pill-size]'),
    ).toHaveLength(1);
    expect(summary.querySelector('data[value="n"]')).toHaveTextContent('n');
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
    expect(strong?.querySelectorAll('data[value="name"]')).toHaveLength(1);
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

    expect(summary.querySelector('h2 data[value="name"]')).toBeInTheDocument();
    expect(summary.querySelectorAll('p')).toHaveLength(2);
    expect(summary.querySelector('hr')).toBeInTheDocument();
  });

  it('draws text in a field on one line as a label, without a paragraph', () => {
    const { getByTestId } = renderSummary('Tell us about **{name}**', true);
    const summary = getByTestId('summary');

    expect(summary.querySelector('p')).toBeNull();
    expect(
      summary.querySelector('strong data[value="name"]'),
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
    expect(summary.querySelector('data[value="name"]')).toBeInTheDocument();
  });
});

describe('DynamicMessageSummary pills', () => {
  it('draws each value as the pill of its kind, an attribute’s own name in its own direction', () => {
    const { getByTestId } = render(
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <div data-testid="summary">
          <DynamicMessageSummary
            message={`{${TEAM}} {now}`}
            markdown={false}
            multiline={false}
            locale={LOCALE}
            site={{
              context: {
                roles: new Set(['ego']),
                variablesFor: (role) =>
                  role === 'ego'
                    ? { [TEAM_ID]: { name: 'team-b!', type: 'text' } }
                    : undefined,
              },
            }}
          />
        </div>
      </ProtocolLocalizationProvider>,
    );
    const summary = getByTestId('summary');

    // The researcher's name, which reads in its own direction whatever the
    // interface's is.
    const attribute = summary.querySelector('data[value="team-b!"]');
    expect(attribute).toHaveAttribute('data-attribute-type', 'text');
    expect(attribute?.querySelector('[dir="auto"]')).toHaveTextContent(
      'team-b!',
    );

    // A value the interview supplies, with its own kind.
    expect(
      summary.querySelector('data[data-attribute-type="datetime"]'),
    ).toBeInTheDocument();
  });
});

describe('DynamicMessageSummary of a value the place does not offer', () => {
  it('says that a deleted attribute was deleted, in a pill and in a set of versions', () => {
    const { getByTestId } = renderSummary(
      `{${TEAM}} and {${TEAM}, select, missing {} other {known}}`,
      false,
    );
    const summary = getByTestId('summary');

    expect(summary).toHaveTextContent(
      'Deleted attribute and Deleted attribute',
    );
    expect(summary).not.toHaveTextContent(TEAM);
  });

  it('calls an attribute the codebook still has by its name', () => {
    const { getByTestId } = render(
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <div data-testid="summary">
          <DynamicMessageSummary
            message={`Hi {${TEAM}}`}
            markdown={false}
            multiline={false}
            locale={LOCALE}
            site={{
              ...SITE,
              conditions: {
                values: {},
                codebook: {
                  ego: {
                    variables: { [TEAM_ID]: { name: 'team', type: 'text' } },
                  },
                },
                subject: undefined,
                allowEgoRules: true,
              },
            }}
          />
        </div>
      </ProtocolLocalizationProvider>,
    );
    expect(getByTestId('summary')).toHaveTextContent('Hi team');
  });
});

describe('DynamicMessageSummary of a page with a logic block', () => {
  it('lists each branch under the case in which it is shown', () => {
    const { getByTestId } = renderSummary(
      `Before\n\n{${TEAM}, select, missing {Nobody yet.} other {Thanks, {${TEAM}}.}}\n\nAfter`,
      true,
      true,
    );
    const summary = getByTestId('summary');

    const branches = summary.querySelectorAll('[data-branch-summary]');
    expect([...branches].map((branch) => branch.textContent)).toEqual([
      'If not knownNobody yet.',
      'Any other answerThanks, Deleted attribute.',
    ]);
    expect(summary).toHaveTextContent(/^Before.*After$/);
  });

  it('shows the `#` of a number block’s version as the value it counts', () => {
    const { getByTestId } = renderSummary(
      `{${TEAM}, select, missing {None.} other {{${TEAM}, plural, one {# team} other {# teams}}}}`,
      true,
      true,
    );
    const summary = getByTestId('summary');

    const branches = summary.querySelectorAll('[data-branch-summary]');
    expect(branches).toHaveLength(3);
    for (const branch of [...branches].slice(1)) {
      expect(
        branch.querySelector('data[data-variable-pill-size]'),
      ).toBeTruthy();
    }
    expect(summary.textContent).not.toContain('#');
    expect(summary.querySelector('h1')).toBeNull();
  });
});
