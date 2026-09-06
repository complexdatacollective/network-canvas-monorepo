import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { formatMessageError } from '@codaco/app-i18n/messages';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import { useStageEditorController } from '../../controller.ts';
import ProtocolField from '../../form/ProtocolField.tsx';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import { enIntl, esIntl } from '../../testing/i18n.ts';
import { describeRule } from '../ruleDescription.ts';
import { ruleDraftRefusal } from '../RuleEditorDialog.tsx';
import { ruleSubjectMessages } from '../ruleMessages.ts';
import RulePreview from '../RulePreview.tsx';
import { QueryRuleSetField } from '../RuleSetField.tsx';
import { createSession, testCodebook } from './fixtures.ts';

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

/**
 * A refusal that quotes one of this package's own noun phrases reads in one
 * language throughout.
 *
 * `ruleDraftRefusal` runs where no formatter is in scope — it is called to
 * decide whether a draft may be saved — so it encodes its sentence as a
 * message error and `FieldErrors` resolves it at render. A phrase interpolated
 * into that sentence therefore has to travel as a REFERENCE: one formatted
 * before the reader's language is known would be frozen into the encoded
 * string, and the researcher would read an English phrase inside an otherwise
 * Spanish sentence.
 */
describe('a refusal that quotes a noun phrase of its own', () => {
  // A boolean beside the string option the v8 migration made of it: the one
  // operand that can never match, and the one refusal that names a phrase
  // this package owns rather than a value the researcher typed.
  const migratedBooleanRule = {
    id: 'rule-3',
    type: 'node',
    options: {
      type: 'person',
      attribute: 'mood',
      operator: 'INCLUDES',
      value: [true],
    },
  };

  const refusalText = (): string => {
    const refusal = ruleDraftRefusal(migratedBooleanRule, testCodebook, [
      'node',
      'edge',
    ]);
    const [message] = Object.values(refusal?.fieldErrors ?? {});
    // A field may be refused with several sentences; this one is refused with
    // exactly the one that quotes the noun phrase, so anything else means the
    // refusal under test is not the one that came back.
    expect(typeof message).toBe('string');
    return message as string;
  };

  it('reads wholly in Spanish', () => {
    const read = formatMessageError(refusalText(), esIntl);

    expect(read).toBe(
      'Esta regla compara con un valor verdadero/falso, que no puede ser una de las opciones de este atributo. Elige una de las opciones que ofrece.',
    );
    // Named separately from the whole sentence above: this is the half that
    // was frozen, and asserting it alone says what broke when it regresses.
    expect(read).not.toContain('a true/false value');
  });

  it('reads wholly in English', () => {
    expect(formatMessageError(refusalText(), enIntl)).toBe(
      'This rule compares against a true/false value, which cannot be one of this attribute’s options. Choose from the options it offers.',
    );
  });
});

/**
 * An unsaved rule survives the researcher changing language.
 *
 * `RuleList` binds one editor component per list and keeps it mounted across
 * editing sessions, because Fresco has no whole-form reinitialise and a
 * remount reseeds the dialog's field store from the rule as it was STORED.
 * The rule-type labels are formatted copy, so the array holding them is
 * rebuilt on every language change; closing that array into the bound editor
 * made it a new component type each time, and React unmounts the old one —
 * discarding whatever the researcher had entered but not yet saved.
 */
function LocaleSwitchingRuleList({ locale }: { locale: 'en' | 'es' }) {
  const [session] = useState(createSession);
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={locale === 'es' ? protocolBuilderCatalogs.es : undefined}
    >
      <DialogProvider>
        <StageEditorShell controller={controller}>
          <BuilderSection title="Skip logic">
            <ProtocolField
              name="skipLogic.filter"
              label="Rules"
              component={QueryRuleSetField}
            />
          </BuilderSection>
        </StageEditorShell>
      </DialogProvider>
    </AppI18nProvider>
  );
}

describe('a rule being written when the language changes', () => {
  it('keeps the choices already made', async () => {
    const user = userEvent.setup();
    // The language is changed by re-rendering rather than by a control on the
    // page: the open dialog is modal, so a switcher outside it is hidden from
    // the accessibility tree — and a host changes the locale from above this
    // tree anyway.
    const { rerender } = render(<LocaleSwitchingRuleList locale="en" />);

    await user.click(
      screen.getByRole('button', { name: 'Add new skip logic rule' }),
    );
    await screen.findByRole('dialog', { name: 'Construct a Rule' });

    // One choice, and a control that only exists because of it: a reseeded
    // store loses both, which is the loss a researcher would see.
    await user.click(
      screen.getByRole('radio', {
        name: 'Ego - match one of the ego attributes.',
      }),
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /Ego attribute/ }),
      'egoName',
    );

    rerender(<LocaleSwitchingRuleList locale="es" />);

    // Still the dialog that was open, still holding the draft — and now
    // reading in the new language, which is the point of changing it.
    expect(
      await screen.findByRole('radio', {
        name: 'Ego: comprobar uno de los atributos de ego.',
      }),
    ).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: /atributo de ego/i }),
    ).toHaveValue('egoName');
  });
});
