import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import {
  useFormHasValue,
  useFormValue,
} from '@codaco/fresco-ui/form/hooks/useFormValue';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';

import { protocolBuilderCatalogs } from '../../../locales/catalogs.ts';
import type { ProtocolLocalization } from '../../../localization/localizedText.ts';
import {
  ProtocolLocalizationProvider,
  useEditingLanguage,
} from '../../../localization/ProtocolLocalization.tsx';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../../protocol-context.ts';

/**
 * The protocol the pane reads, stated rather than hosted.
 *
 * `useProtocolContext` derives the read model from the host's own queries, so
 * mounting this pane alone over a real host would be mounting a whole editor —
 * and what these tests are about is the pane, not the plumbing. The integration
 * criteria (the two named regions, a question appearing as it is typed, the
 * control changing, an option added in the codebook) are asserted in
 * `FormFieldsSection.test.tsx`, through the real dialog over the real host.
 *
 * `vi.hoisted` because `vi.mock`'s factory runs before the module body.
 */
const mocks = vi.hoisted(() => {
  const person = {
    name: 'Person',
    label: { en: 'Person' },
    color: 'node-color-seq-1' as const,
    shape: { default: 'circle' as const },
    variables: {
      age: {
        name: 'Age',
        label: 'Age',
        type: 'number' as const,
        component: 'Number' as const,
      },
      // A second attribute the first is indistinguishable from by kind and
      // control alone — the pair a rebound row is told apart by.
      yearsKnown: {
        name: 'Years known',
        label: 'Years known',
        type: 'number' as const,
        component: 'Number' as const,
      },
      satisfaction: {
        name: 'Satisfaction',
        label: 'Satisfaction',
        type: 'scalar' as const,
        component: 'VisualAnalogScale' as const,
        parameters: {
          minLabel: { en: 'Not at all' },
          maxLabel: { en: 'Completely' },
        },
      },
      consents: {
        name: 'Consents',
        label: 'Consents',
        type: 'boolean' as const,
        component: 'Boolean' as const,
        validation: { required: true },
      },
    },
  };
  const context: ProtocolBuilderProtocolContext = {
    codebook: { node: { person } },
    assets: {},
    orderedStages: [],
    issues: [],
  };
  return { context };
});

vi.mock('../../../state/protocolContext.ts', () => ({
  useProtocolContext: () => mocks.context,
}));

const { default: FieldPreviewPane } = await import('../FieldPreviewPane.tsx');

// Asserted as literals rather than by formatting the descriptor the component
// read: re-formatting would pass whatever the catalog said, including nothing.
const SHARED_ATTRIBUTE =
  'When selecting an existing attribute, changes you make to the input control or validation options will also change other uses of this attribute.';
const EMPTY_STATE =
  'Select an attribute and input control to preview this field.';
const REQUIRED_EN = 'You must answer this question before continuing.';
const REQUIRED_ES = 'Debes responder a esta pregunta antes de continuar.';

const PERSON: CodebookSubject = { entity: 'node', type: 'person' };

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };

const en = (text: string) => ({ en: text });

/** The create sentinel, written out so a change to it has to be made twice. */
const CREATE_NEW_ATTRIBUTE = '#create-new-attribute';

afterEach(() => {
  cleanup();
});

/**
 * What the dialog's own store holds after a trial answer.
 *
 * The preview mounts the participant's field in a form store of its own, so
 * nothing typed into it may reach the store the row is assembled from. A value
 * is not enough to prove that: the authoring store would report the same
 * `undefined` for a name it never held as for one it holds empty. So the probe
 * reads `hasValue` as well, and holds a sentinel of its own that a stray write
 * would overwrite.
 */
function ParentResponseProbe() {
  const previewHasValue = useFormHasValue(['preview-value'], 'opaque');
  const values = useFormValue(['authoring-sentinel'], 'opaque');
  return (
    <>
      <Field
        name="authoring-sentinel"
        nameMode="opaque"
        label="Researcher sentinel"
        component={InputField}
        initialValue="Authored_Sentinel_Á1"
      />
      <output data-testid="parent-response">
        {JSON.stringify({
          previewHasValue: previewHasValue['preview-value'],
          sentinel: values['authoring-sentinel'],
        })}
      </output>
    </>
  );
}

/** The editing language the provider holds, for a test of what moves it. */
function EditingLanguageProbe() {
  const { locale } = useEditingLanguage();
  return <output data-testid="editing-language">{locale}</output>;
}

const expectUnchangedParent = () => {
  expect(screen.getByTestId('parent-response').textContent).toBe(
    JSON.stringify({
      previewHasValue: false,
      sentinel: 'Authored_Sentinel_Á1',
    }),
  );
  expect(
    screen.getByRole('textbox', { name: 'Researcher sentinel' }),
  ).toHaveValue('Authored_Sentinel_Á1');
};

/** The same provider `renderStageEditor` mounts, for a pane on its own. */
function LocaleFrame({
  locale,
  children,
}: Readonly<{ locale?: string; children: ReactNode }>) {
  if (locale === undefined) return children;
  return (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={mergeCatalogs(
        commonCatalogs[locale] ?? {},
        frescoUiCatalogs[locale] ?? {},
        protocolBuilderCatalogs[locale] ?? {},
      )}
      manageDocument={false}
    >
      {children}
    </AppI18nProvider>
  );
}

const renderPreview = (
  item: Record<string, unknown>,
  options: Readonly<{
    mode?: 'form' | 'composer';
    subject?: CodebookSubject | undefined;
    locale?: string;
    localization?: ProtocolLocalization;
    probe?: boolean;
    onSubmit?: () => { success: true };
    fields?: ReactNode;
  }> = {},
) => {
  const submitAuthoring = options.onSubmit ?? (() => ({ success: true }));
  render(
    <LocaleFrame
      {...(options.locale === undefined ? {} : { locale: options.locale })}
    >
      <ProtocolLocalizationProvider
        localization={options.localization ?? ENGLISH}
      >
        <Form onSubmit={submitAuthoring}>
          {options.probe === true && <ParentResponseProbe />}
          {options.fields}
          <FieldPreviewPane
            subject={'subject' in options ? options.subject : PERSON}
            {...(options.mode === undefined ? {} : { mode: options.mode })}
            item={item}
          />
        </Form>
      </ProtocolLocalizationProvider>
    </LocaleFrame>,
  );
  return screen.getByRole('region', {
    name:
      options.locale === 'es'
        ? 'Vista previa interactiva'
        : 'Interactive preview',
  });
};

describe('FieldPreviewPane', () => {
  it('shows the existing-attribute notice in the preview pane', () => {
    const preview = renderPreview({ variable: 'age' });

    expect(preview).toHaveTextContent(SHARED_ATTRIBUTE);
  });

  it('does not show the notice while an attribute is being invented', () => {
    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'Nickname',
      _component: 'Text',
    });

    expect(screen.queryByText(SHARED_ATTRIBUTE)).not.toBeInTheDocument();
  });

  it('carries the interview theme on the preview’s own root', () => {
    const preview = renderPreview({ variable: 'age' });

    const themed = preview.querySelector('[data-theme-interview]');
    expect(themed).not.toBeNull();
    expect(themed).toHaveClass('theme-base');
    // The field is inside it, so the participant's control is what the theme
    // is actually applied to rather than a wrapper beside it.
    expect(
      themed?.contains(
        screen.getByRole('spinbutton', {
          name: 'Your question will appear here.',
        }),
      ),
    ).toBe(true);
  });

  it('offers nothing to answer until an attribute and a control are both chosen', () => {
    renderPreview({});

    expect(screen.getByText(EMPTY_STATE)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Check response' }),
    ).not.toBeInTheDocument();
  });

  it('previews the attribute’s own settings before the dialog registers any field', () => {
    // The dialog opens before its sections mount, and a scale's end labels
    // belong to the attribute rather than to the row — so the committed row
    // plus the live codebook is all there is to draw from at that moment.
    renderPreview({ variable: 'satisfaction' });

    expect(screen.getByText('Not at all')).toBeVisible();
    expect(screen.getByText('Completely')).toBeVisible();
  });

  it('drops the attribute’s settings from the preview once the row has cleared them', () => {
    renderPreview(
      { variable: 'satisfaction' },
      {
        fields: (
          <Field
            name="_parameters"
            label="Cleared settings"
            component={InputField}
          />
        ),
      },
    );

    expect(screen.queryByText('Not at all')).not.toBeInTheDocument();
    expect(screen.queryByText('Completely')).not.toBeInTheDocument();
  });

  it('previews an invented attribute under the question being typed', () => {
    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'Nickname',
      _component: 'Text',
      prompt: en('Research_Question_Á1'),
    });

    expect(
      screen.getByRole('textbox', { name: 'Research_Question_Á1' }),
    ).toBeVisible();
  });

  it('names a composer’s field by its label, and stands in when it has none', () => {
    renderPreview(
      { variable: 'age', component: 'Number', label: en('Research_Label_Á1') },
      { mode: 'composer' },
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Research_Label_Á1' }),
    ).toBeVisible();

    cleanup();

    // No label written yet. The attribute's own name is never a caption, so
    // the stand-in the form family uses stands in here too.
    renderPreview(
      { variable: 'age', component: 'Number' },
      { mode: 'composer' },
    );
    expect(
      screen.getByRole('spinbutton', {
        name: 'Your question will appear here.',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('spinbutton', { name: 'Age' }),
    ).not.toBeInTheDocument();
  });

  it('treats a caption of nothing but spaces as nothing authored', () => {
    // The same rule the schema applies: text of nothing but spaces says
    // nothing, so a stray space is not a caption.
    renderPreview(
      { variable: 'age', component: 'Number', label: en('   ') },
      { mode: 'composer' },
    );
    expect(
      screen.getByRole('spinbutton', {
        name: 'Your question will appear here.',
      }),
    ).toBeVisible();

    cleanup();

    // An emptied box reads the same way, and an authored one still wins.
    renderPreview(
      { variable: 'age', component: 'Number', label: en('') },
      { mode: 'composer' },
    );
    expect(
      screen.getByRole('spinbutton', {
        name: 'Your question will appear here.',
      }),
    ).toBeVisible();

    cleanup();

    renderPreview(
      { variable: 'age', component: 'Number', label: en('Research_Label_Á1') },
      { mode: 'composer' },
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Research_Label_Á1' }),
    ).toBeVisible();

    cleanup();

    // And the form family's question, which is read by the same rule.
    renderPreview({ variable: 'age', prompt: en('  \n  ') });
    expect(
      screen.getByRole('spinbutton', {
        name: 'Your question will appear here.',
      }),
    ).toBeVisible();
  });

  it('reads an invented attribute’s kind off the control and nothing else', () => {
    // Two rows alike in every other respect, and the participant meets a
    // different kind of answer in each.
    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'Nickname',
      _component: 'Text',
      prompt: en('Research_Question_Á2'),
    });

    expect(
      screen.getByRole('textbox', { name: 'Research_Question_Á2' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('spinbutton', { name: 'Research_Question_Á2' }),
    ).not.toBeInTheDocument();

    cleanup();

    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'Nickname',
      _component: 'Number',
      prompt: en('Research_Question_Á2'),
    });

    expect(
      screen.getByRole('spinbutton', { name: 'Research_Question_Á2' }),
    ).toBeVisible();
  });

  it('stands in for a question nobody has written yet', () => {
    renderPreview({ variable: 'age' });

    expect(
      screen.getByRole('spinbutton', {
        name: 'Your question will appear here.',
      }),
    ).toBeVisible();
  });

  it('renders a list attribute with no values yet as an empty control', () => {
    // A list of answers is authored after the attribute that holds it, so
    // there is a real intermediate state with no values. Rendering nothing
    // would be right; throwing on `options.map` would not.
    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _component: 'RadioGroup',
      prompt: en('How often?'),
    });

    const group = screen.getByRole('radiogroup', { name: 'How often?' });
    expect(within(group).queryAllByRole('radio')).toHaveLength(0);
  });

  it('previews the scale labels the row is writing for an invented attribute', () => {
    const pane = renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'closeness',
      _component: 'VisualAnalogScale',
      _parameters: { minLabel: en('Not close'), maxLabel: en('Very close') },
      prompt: en('How close are you?'),
    });

    expect(within(pane).getByText('Not close')).toBeVisible();
    expect(within(pane).getByText('Very close')).toBeVisible();
  });

  it('previews the values the row is writing for an invented list attribute', () => {
    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'frequency',
      _component: 'RadioGroup',
      _options: [
        { label: en('Daily'), value: 'daily' },
        { label: en('Weekly'), value: 'weekly' },
      ],
      prompt: en('How often?'),
    });

    const group = screen.getByRole('radiogroup', { name: 'How often?' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label') ?? radio.textContent),
    ).toHaveLength(2);
    expect(within(group).getByText('Daily')).toBeVisible();
  });

  it('starts the trial answer again when the row is bound to another attribute', () => {
    // Two numbers collected by the same control resolve to the same field, so
    // the kind-and-control pairing alone cannot tell the rebinding apart. The
    // answer typed for the first must not stand under the second's question
    // and be checked against the second's rules.
    const previewOf = (variable: string, prompt: string) => (
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <Form onSubmit={() => ({ success: true as const })}>
          <FieldPreviewPane
            subject={PERSON}
            item={{ variable, prompt: en(prompt) }}
          />
        </Form>
      </ProtocolLocalizationProvider>
    );
    const { rerender } = render(previewOf('age', 'Research_Question_Á1'));

    const age = screen.getByRole('spinbutton', {
      name: 'Research_Question_Á1',
    });
    fireEvent.change(age, { target: { value: '42' } });
    expect(age).toHaveValue(42);

    rerender(previewOf('yearsKnown', 'Research_Question_Á2'));

    expect(
      screen.getByRole('spinbutton', { name: 'Research_Question_Á2' }),
    ).toHaveValue(null);
  });

  it('offers a composer nothing to answer when its attribute has left the codebook', () => {
    // A composer's row keeps its own control after the attribute it collects
    // for is deleted from under it, or arrives in an imported codebook without
    // it. The interview refuses such a row outright — `createFieldMetadata`
    // throws on a missing codebook entry — so a kind inferred from the control
    // would preview a working field the participant can never meet.
    renderPreview(
      { variable: 'departed', component: 'Number' },
      { mode: 'composer' },
    );

    expect(screen.getByText(EMPTY_STATE)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Check response' }),
    ).not.toBeInTheDocument();
  });

  it('offers nothing while the row’s control and its attribute disagree', () => {
    // The row keeps the control it was given for the attribute it used to
    // collect for a render or two after it is rebound. That pairing is one the
    // protocol schema refuses, so the attribute's own control answers instead.
    renderPreview({ variable: 'age', _component: 'CheckboxGroup' });

    expect(
      screen.getByRole('spinbutton', {
        name: 'Your question will appear here.',
      }),
    ).toBeVisible();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('runs the attribute’s own rules against a trial answer without touching the draft', async () => {
    const item = { variable: 'consents', prompt: en('Research_Question_Á1') };
    const original = structuredClone(item);
    const submitAuthoring = vi.fn(() => ({ success: true as const }));
    renderPreview(item, { probe: true, onSubmit: submitAuthoring });

    fireEvent.click(screen.getByRole('button', { name: 'Check response' }));
    expect(await screen.findByText(REQUIRED_EN)).toBeVisible();
    expectUnchangedParent();

    // A required boolean resolves to the Yes/No pair, which is a radio group.
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check response' }));
    await waitFor(() => expect(screen.queryByText(REQUIRED_EN)).toBeNull());

    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked();
    expectUnchangedParent();
    expect(item).toEqual(original);
    expect(submitAuthoring).not.toHaveBeenCalled();
  });

  it('reads the pane and the participant’s own field in Spanish, leaving authored words alone', async () => {
    const item = {
      variable: 'consents',
      prompt: en('Research_Question_Á1'),
      hint: en('Authored_Hint_Á1'),
    };
    const original = structuredClone(item);
    const submitAuthoring = vi.fn(() => ({ success: true as const }));
    const preview = renderPreview(item, {
      locale: 'es',
      probe: true,
      onSubmit: submitAuthoring,
    });

    expect(preview).toHaveTextContent(
      'Al seleccionar un atributo existente, los cambios que hagas en el control de entrada o las opciones de validación también afectarán a los demás usos de ese atributo.',
    );
    const check = within(preview).getByRole('button', {
      name: 'Comprobar respuesta',
    });
    fireEvent.click(check);
    expect(await screen.findByText(REQUIRED_ES)).toBeVisible();

    // The researcher's own words are protocol content and are rendered as
    // they were typed, in any language.
    const field = screen.getByRole('radio', { name: 'Sí' });
    expect(screen.getByText('Authored_Hint_Á1')).toBeVisible();
    expect(
      screen.getByRole('radiogroup', { name: 'Research_Question_Á1' }),
    ).toBeVisible();
    expect(field.closest('[lang]')).toHaveAttribute('lang', 'es');
    expect(field.closest('[dir]')).toHaveAttribute('dir', 'ltr');

    fireEvent.click(field);
    fireEvent.click(check);
    await waitFor(() => expect(screen.queryByText(REQUIRED_ES)).toBeNull());
    expectUnchangedParent();
    expect(item).toEqual(original);
    expect(submitAuthoring).not.toHaveBeenCalled();
  });

  it('keeps a participant scale’s own popup inside the locale region and the portal boundary', async () => {
    const item = { variable: 'satisfaction', prompt: en('Research_Scale_Á1') };
    const original = structuredClone(item);
    renderPreview(item, { locale: 'es', probe: true });

    const slider = screen.getByRole('slider', { name: 'Research_Scale_Á1' });
    fireEvent.keyDown(slider, { key: 'Enter' });
    const popup = await screen.findByTestId('scale-value-popover');

    expect(popup.closest('[lang]')).toHaveAttribute('lang', 'es');
    expect(popup.closest('[dir]')).toHaveAttribute('dir', 'ltr');
    // Inside the locale region rather than merely under one: a popup portalled
    // to the document body would satisfy `closest` through the wrong ancestor.
    expect(slider.closest('[lang]')?.contains(popup)).toBe(true);
    expectUnchangedParent();
    expect(item).toEqual(original);
  });

  it('previews a composer’s invented attribute from the control it chose', () => {
    // The composer's row keeps its control on its own `component` rather than
    // the `_component` the form family's dialog writes, so this pins that the
    // preview reads the composer's own key.
    renderPreview(
      {
        variable: CREATE_NEW_ATTRIBUTE,
        _newVariableName: 'favouriteFood',
        component: 'Text',
        label: en('Favourite food'),
      },
      { mode: 'composer' },
    );

    expect(
      screen.getByRole('textbox', { name: 'Favourite food' }),
    ).toBeVisible();
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument();
  });

  it('previews nothing for a composer row whose attribute the codebook has lost', () => {
    // Not an invention: this row names a real attribute that is no longer
    // there — deleted from under it, or absent from an imported codebook. The
    // interview refuses such a row outright, so a preview assembled from the
    // control the row still carries would show a working field the participant
    // will never meet.
    renderPreview(
      {
        variable: 'favouriteFood',
        component: 'Text',
        label: en('Favourite food'),
      },
      { mode: 'composer' },
    );

    expect(screen.getByText(EMPTY_STATE)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('captions the field in the language being edited, falling back as a participant would', () => {
    const bilingual: ProtocolLocalization = {
      defaultLocale: 'es',
      locales: ['es', 'en'],
    };
    renderPreview(
      {
        variable: 'age',
        prompt: { en: 'How old are you?', es: '¿Cuántos años tienes?' },
      },
      { localization: bilingual },
    );
    expect(
      screen.getByRole('spinbutton', { name: '¿Cuántos años tienes?' }),
    ).toBeVisible();

    cleanup();

    renderPreview(
      { variable: 'age', prompt: en('How old are you?') },
      { localization: bilingual },
    );
    expect(
      screen.getByRole('spinbutton', { name: 'How old are you?' }),
    ).toBeVisible();
    expect(
      screen.getByText('How old are you?').closest('[lang]'),
    ).toHaveAttribute('lang', 'en');
  });

  describe('language menu', () => {
    const BILINGUAL: ProtocolLocalization = {
      defaultLocale: 'en',
      locales: ['en', 'es'],
    };

    const translated = (english: string, spanish: string) => ({
      en: english,
      es: spanish,
    });

    /**
     * A list attribute the row is inventing, every word of it written in both
     * languages unless a case says otherwise.
     */
    const frequencyRow = (overrides: Record<string, unknown> = {}) => ({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'frequency',
      _component: 'RadioGroup',
      prompt: translated('How often?', '¿Con qué frecuencia?'),
      hint: translated('Pick one.', 'Elige una.'),
      _options: [
        { label: translated('Daily', 'Diario'), value: 'daily' },
        { label: translated('Weekly', 'Semanal'), value: 'weekly' },
      ],
      ...overrides,
    });

    /** A scale attribute the row is inventing, written in both languages. */
    const closenessRow = (parameters: Record<string, unknown> = {}) => ({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'closeness',
      _component: 'VisualAnalogScale',
      prompt: translated('How close are you?', '¿Qué tan cerca están?'),
      _parameters: {
        minLabel: translated('Not close', 'Nada cerca'),
        maxLabel: translated('Very close', 'Muy cerca'),
        ...parameters,
      },
    });

    const languageMenu = () =>
      screen.getByRole('button', { name: /Editing language/ });

    async function chooseLanguage(name: RegExp) {
      const user = userEvent.setup();
      await user.click(languageMenu());
      await user.click(await screen.findByRole('menuitemradio', { name }));
    }

    /** The languages the open menu tags "Missing", as their language tags. */
    async function languagesMarkedMissing() {
      const user = userEvent.setup();
      await user.click(languageMenu());
      const items = await screen.findAllByRole('menuitemradio');
      const marked = items
        .filter((item) => within(item).queryByText('Missing') !== null)
        .map((item) => item.querySelector('[lang]')?.getAttribute('lang'));
      await user.keyboard('{Escape}');
      return marked;
    }

    it('draws no language menu for a protocol written in one language', () => {
      renderPreview({ variable: 'age', prompt: en('How old are you?') });

      expect(
        screen.queryByRole('button', { name: /Editing language/ }),
      ).not.toBeInTheDocument();
    });

    it('offers the protocol’s languages in the pane’s own region', () => {
      const preview = renderPreview(
        { variable: 'age', prompt: translated('How old?', '¿Qué edad?') },
        { localization: BILINGUAL },
      );

      expect(
        within(preview).getByRole('button', { name: /Editing language/ }),
      ).toBeVisible();
    });

    it('captions the field in the language chosen from the preview', async () => {
      renderPreview(
        {
          variable: 'age',
          prompt: translated('How old are you?', '¿Cuántos años tienes?'),
        },
        { localization: BILINGUAL },
      );
      expect(
        screen.getByRole('spinbutton', { name: 'How old are you?' }),
      ).toBeVisible();

      await chooseLanguage(/^español/i);

      expect(
        screen.getByRole('spinbutton', { name: '¿Cuántos años tienes?' }),
      ).toBeVisible();
      expect(
        screen.getByText('¿Cuántos años tienes?').closest('[lang]'),
      ).toHaveAttribute('lang', 'es');
    });

    it('shows a participant’s fallback text, in the fallback’s language, where a translation is missing', async () => {
      // The fallback is Spanish and the pane's own language is English, so the
      // language the text is tagged with can only have come from the fallback.
      renderPreview(
        { variable: 'age', prompt: { es: '¿Cuántos años tienes?' } },
        { localization: { defaultLocale: 'es', locales: ['es', 'en'] } },
      );

      await chooseLanguage(/^english/i);

      expect(languageMenu()).toHaveTextContent('English');
      expect(
        screen.getByRole('spinbutton', { name: '¿Cuántos años tienes?' }),
      ).toBeVisible();
      expect(
        screen.getByText('¿Cuántos años tienes?').closest('[lang]'),
      ).toHaveAttribute('lang', 'es');
    });

    it('shows each answer’s label in the chosen language', async () => {
      renderPreview(frequencyRow(), { localization: BILINGUAL });
      expect(screen.getByText('Daily')).toBeVisible();

      await chooseLanguage(/^español/i);

      expect(screen.getByText('Diario')).toBeVisible();
      expect(screen.queryByText('Daily')).not.toBeInTheDocument();
    });

    it('moves every localized field to the language chosen from the preview', async () => {
      renderPreview(
        { variable: 'age', prompt: translated('How old?', '¿Qué edad?') },
        {
          localization: BILINGUAL,
          fields: <EditingLanguageProbe />,
        },
      );
      expect(screen.getByTestId('editing-language')).toHaveTextContent('en');

      await chooseLanguage(/^español/i);

      expect(screen.getByTestId('editing-language')).toHaveTextContent('es');
    });

    it.each([
      ['every word is written in both languages', frequencyRow(), []],
      [
        'the caption has no Spanish',
        frequencyRow({ prompt: en('How often?') }),
        ['es'],
      ],
      [
        'the hint has no Spanish',
        frequencyRow({ hint: en('Pick one.') }),
        ['es'],
      ],
      [
        'one answer’s label has no Spanish',
        frequencyRow({
          _options: [
            { label: translated('Daily', 'Diario'), value: 'daily' },
            { label: en('Weekly'), value: 'weekly' },
          ],
        }),
        ['es'],
      ],
      [
        'only the Spanish is written',
        frequencyRow({
          prompt: { es: '¿Con qué frecuencia?' },
          hint: { es: 'Elige una.' },
          _options: [{ label: { es: 'Diario' }, value: 'daily' }],
        }),
        ['en'],
      ],
      [
        'every word of a scale is written in both languages',
        closenessRow(),
        [],
      ],
      [
        'a scale’s end label has no Spanish',
        closenessRow({ maxLabel: en('Very close') }),
        ['es'],
      ],
    ])(
      'tags the languages that lack a translation when %s',
      async (_case, row, expected) => {
        renderPreview(row, { localization: BILINGUAL });

        expect(await languagesMarkedMissing()).toEqual(expected);
        if (expected.length === 0) {
          expect(screen.queryByText(/translations? missing/)).toBeNull();
        } else {
          expect(screen.getByText('1 translation missing')).toBeVisible();
        }
      },
    );

    it('does not count a hint nobody has written as a missing translation', async () => {
      const { hint: _hint, ...withoutHint } = frequencyRow();
      renderPreview(withoutHint, { localization: BILINGUAL });

      expect(await languagesMarkedMissing()).toEqual([]);
    });

    it('does not count an answer with no label yet, which the preview does not show', async () => {
      renderPreview(
        frequencyRow({
          _options: [
            { label: translated('Daily', 'Diario'), value: 'daily' },
            { value: 'weekly' },
          ],
        }),
        { localization: BILINGUAL },
      );

      expect(await languagesMarkedMissing()).toEqual([]);
    });

    it('does not count the stand-in for a question nobody has written', async () => {
      renderPreview({ variable: 'age' }, { localization: BILINGUAL });

      expect(await languagesMarkedMissing()).toEqual([]);
    });
  });

  it('offers nothing to answer before the protocol’s languages are known', () => {
    render(
      <Form onSubmit={() => ({ success: true as const })}>
        <FieldPreviewPane
          subject={PERSON}
          item={{ variable: 'age', prompt: en('How old are you?') }}
        />
      </Form>,
    );

    expect(screen.getByText(EMPTY_STATE)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('previews nothing at all when the section cannot say whose codebook it collects into', () => {
    renderPreview({ variable: 'age' }, { subject: undefined });

    expect(screen.getByText(EMPTY_STATE)).toBeVisible();
  });
});
