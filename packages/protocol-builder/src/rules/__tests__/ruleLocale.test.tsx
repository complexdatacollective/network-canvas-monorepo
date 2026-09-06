import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import { esIntl } from '../../testing/i18n.ts';
import { describeRule } from '../ruleDescription.ts';
import { ruleSubjectMessages } from '../ruleMessages.ts';
import RulePreview from '../RulePreview.tsx';
import { testCodebook } from './fixtures.ts';

/**
 * A rule reads back in the researcher's own language, through both routes the
 * copy in this directory takes.
 *
 * `RulePreview` renders its own words with `useAppIntl()`, and everything it
 * is handed — the operator phrase, the attribute's spoken description — comes
 * from `describeRule`, which is pure and takes the formatter as an argument.
 * The two have to agree: the row shows the preview's markup and the field's
 * verdict is written from the same description, so a translated preview beside
 * an English verdict is exactly the drift this checks for.
 *
 * The rest of this directory's suite mounts no provider, so every component
 * renders its English `defaultMessage` and the existing English assertions
 * stand. This is the one test that mounts one.
 */
const alterRule = {
  id: 'rule-1',
  type: 'node',
  options: {
    type: 'person',
    attribute: 'age',
    operator: 'GREATER_THAN',
    value: 30,
  },
};

const inSpanish = (rule: unknown) => (
  <AppI18nProvider
    locale="es"
    locales={ecosystemLocales}
    messages={protocolBuilderCatalogs.es}
  >
    <RulePreview
      description={describeRule({ rule, codebook: testCodebook, intl: esIntl })}
    />
  </AppI18nProvider>
);

describe('a rule read in Spanish', () => {
  it('ships Spanish for the ids this directory declares', () => {
    // Checked first so a merge that has not landed this directory's catalog
    // entries fails saying so, rather than as an unexplained missing string.
    expect(Object.keys(protocolBuilderCatalogs.es ?? {})).toEqual(
      expect.arrayContaining([
        ruleSubjectMessages.alterAttribute.id,
        'protocolBuilder.ruleDescription.alterGreaterThan',
        'protocolBuilder.rulePreview.attribute',
      ]),
    );
  });

  it('reads the whole sentence in Spanish', () => {
    render(inSpanish(alterRule));

    // The connecting word is the preview's own message, formatted through the
    // provider; the entity and attribute names are the researcher's own
    // codebook and stay as they are.
    expect(screen.getByText('con', { exact: true })).toBeInTheDocument();
    // The operator phrase comes from `describeRule`, so this fails if the
    // description is still being built in English beside a Spanish preview.
    expect(screen.getByText('es mayor que')).toBeInTheDocument();
    // Literal rather than formatted from the same descriptor the component
    // reads: asserting `esIntl.formatMessage(...)` here would pass whatever
    // the catalog said, including nothing.
    expect(
      screen.getByLabelText('Age (tipo de atributo: number)'),
    ).toBeInTheDocument();
  });

  it('reads a rule the codebook has broken in Spanish', () => {
    render(
      inSpanish({
        id: 'rule-2',
        type: 'node',
        options: { type: 'person', attribute: 'gone', operator: 'EXISTS' },
      }),
    );

    expect(
      screen.getByLabelText(
        'gone (el atributo ya no está en el libro de códigos)',
      ),
    ).toBeInTheDocument();
  });
});
