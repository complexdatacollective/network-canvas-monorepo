import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import { esIntl } from '../../testing/i18n.ts';
import VariableBooleanAnswerFields from '../components/VariableBooleanAnswerFields.tsx';
import { optionsForShape, validateBooleanAnswers } from '../variableOptions.ts';

const inSpanish = (node: ReactNode) =>
  render(
    <AppI18nProvider
      locale="es"
      locales={ecosystemLocales}
      messages={mergeCatalogs(
        commonCatalogs.es ?? {},
        frescoUiCatalogs.es ?? {},
        protocolBuilderCatalogs.es ?? {},
      )}
      manageDocument={false}
    >
      {node}
    </AppI18nProvider>,
  );

const placeholders = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[placeholder]')].map(
    (input) => input.placeholder,
  );

/**
 * A yes/no attribute nobody has written answers for is a Yes/No question, and
 * the placeholders are the editor's promise about which two words that means.
 *
 * The promise is made twice on the same screen: the refusal beside the fields
 * names them in a sentence ("…or clear both to offer Sí and No"), and the
 * placeholders show them. Both have to be the participant's words, and the
 * participant's words come from fresco-ui's own boolean control — not from
 * anything stored in the protocol.
 */
describe('the placeholders on an unnamed yes/no answer', () => {
  it('reads as what the interview will show, in the reader’s language', () => {
    inSpanish(
      <VariableBooleanAnswerFields
        answers={[
          { label: '', value: true },
          { label: '', value: false },
        ]}
        onChange={() => undefined}
        issues={validateBooleanAnswers(
          [
            { label: 'Acepto', value: true },
            { label: '', value: false },
          ],
          esIntl,
        )}
        readOnly={false}
      />,
    );

    expect(
      screen.getByText(
        'Escribe lo que dice esta respuesta, o borra ambas para ofrecer Sí y No.',
      ),
    ).toBeInTheDocument();
    expect(placeholders()).toEqual(['Sí', 'No']);
  });

  /**
   * And they are the SAME two words the interview renders.
   *
   * Read off fresco-ui's control rather than asserted as literals a second
   * time: `frescoUi.booleanField.yes`/`.no` are what a participant is shown
   * for an attribute carrying no `options`, and the placeholder is a promise
   * about those. Two independent literals would drift the moment either side
   * was reworded, and the drift would be invisible — each half would still
   * pass its own test.
   */
  it('is bound to the words fresco-ui’s own boolean control supplies', () => {
    inSpanish(<BooleanField name="preview" label="Vista previa" />);

    const offered = [
      ...document.querySelectorAll<HTMLElement>('button[role="radio"], button'),
    ]
      .map((button) => button.textContent?.trim() ?? '')
      .filter((text) => text !== '');

    expect(offered).toEqual(['Sí', 'No']);
  });

  /**
   * Nothing about the placeholders is ever STORED.
   *
   * They are a preview, not a default: an attribute with both labels blank
   * carries no `options` key at all, which is what makes fresco-ui supply its
   * own words in the first place. Were "Yes"/"No" seeded into the codebook
   * they would be protocol content — rendered verbatim to every participant in
   * every language — and localising them would have been wrong. This is the
   * claim that settles which of the two it is.
   */
  it('writes nothing into the protocol when both answers are blank', () => {
    expect(
      optionsForShape('boolean', [
        { label: '', value: true },
        { label: '  ', value: false },
      ]),
    ).toBeUndefined();
  });

  /**
   * What the researcher DOES write is protocol content and is stored exactly
   * as typed — including an answer they wrote in English while reading the
   * editor in Spanish.
   */
  it('stores the researcher’s own words untouched', () => {
    expect(
      optionsForShape('boolean', [
        { label: 'Agree', value: true },
        { label: 'Disagree', value: false },
      ]),
    ).toEqual([
      { label: 'Agree', value: true },
      { label: 'Disagree', value: false },
    ]);
  });
});
