import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
    color: 'node-color-seq-1' as const,
    shape: { default: 'circle' as const },
    variables: {
      age: {
        name: 'Age',
        type: 'number' as const,
        component: 'Number' as const,
      },
      satisfaction: {
        name: 'Satisfaction',
        type: 'scalar' as const,
        component: 'VisualAnalogScale' as const,
        parameters: { minLabel: 'Not at all', maxLabel: 'Completely' },
      },
      consents: {
        name: 'Consents',
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
    probe?: boolean;
    onSubmit?: () => { success: true };
  }> = {},
) => {
  const submitAuthoring = options.onSubmit ?? (() => ({ success: true }));
  render(
    <LocaleFrame
      {...(options.locale === undefined ? {} : { locale: options.locale })}
    >
      <Form onSubmit={submitAuthoring}>
        {options.probe === true && <ParentResponseProbe />}
        <FieldPreviewPane
          subject={'subject' in options ? options.subject : PERSON}
          {...(options.mode === undefined ? {} : { mode: options.mode })}
          item={item}
        />
      </Form>
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
      _newVariableType: 'text',
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

  it('previews an invented attribute under the question being typed', () => {
    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'Nickname',
      _newVariableType: 'text',
      _component: 'Text',
      prompt: 'Research_Question_Á1',
    });

    expect(
      screen.getByRole('textbox', { name: 'Research_Question_Á1' }),
    ).toBeVisible();
  });

  it('names a composer’s field by its label, and stands in when it has none', () => {
    renderPreview(
      { variable: 'age', component: 'Number', label: 'Research_Label_Á1' },
      { mode: 'composer' },
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Research_Label_Á1' }),
    ).toBeVisible();

    cleanup();

    // No authored label, so the attribute's own name stands in — which is the
    // composer's rule and never the form family's.
    renderPreview(
      { variable: 'age', component: 'Number' },
      { mode: 'composer' },
    );
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toBeVisible();
  });

  it('treats a caption of nothing but spaces as nothing authored', () => {
    // The same rule the interview applies: `authoredFieldLabel` trims before
    // deciding whether the researcher wrote anything, so a stray space is not
    // a caption and the participant meets the fallback rather than a blank.
    renderPreview(
      { variable: 'age', component: 'Number', label: '   ' },
      { mode: 'composer' },
    );
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toBeVisible();

    cleanup();

    // An emptied box reads the same way, and an authored one still wins.
    renderPreview(
      { variable: 'age', component: 'Number', label: '' },
      { mode: 'composer' },
    );
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toBeVisible();

    cleanup();

    renderPreview(
      { variable: 'age', component: 'Number', label: 'Research_Label_Á1' },
      { mode: 'composer' },
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Research_Label_Á1' }),
    ).toBeVisible();

    cleanup();

    // And the form family's question, which is read by the same rule.
    renderPreview({ variable: 'age', prompt: '  \n  ' });
    expect(
      screen.getByRole('spinbutton', {
        name: 'Your question will appear here.',
      }),
    ).toBeVisible();
  });

  it('previews the answer the chosen control collects when no kind has been chosen', () => {
    // An invented attribute whose kind the row does not hold: the control
    // itself says what the attribute will collect, because every control
    // belongs to exactly one kind of answer.
    renderPreview({
      variable: CREATE_NEW_ATTRIBUTE,
      _newVariableName: 'Nickname',
      _component: 'Text',
      prompt: 'Research_Question_Á2',
    });

    expect(
      screen.getByRole('textbox', { name: 'Research_Question_Á2' }),
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
      _newVariableType: 'ordinal',
      _component: 'RadioGroup',
      prompt: 'How often?',
    });

    const group = screen.getByRole('radiogroup', { name: 'How often?' });
    expect(within(group).queryAllByRole('radio')).toHaveLength(0);
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
    const item = { variable: 'consents', prompt: 'Research_Question_Á1' };
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
      prompt: 'Research_Question_Á1',
      hint: 'Authored_Hint_Á1',
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
    const item = { variable: 'satisfaction', prompt: 'Research_Scale_Á1' };
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

  it('previews nothing at all when the section cannot say whose codebook it collects into', () => {
    renderPreview({ variable: 'age' }, { subject: undefined });

    expect(screen.getByText(EMPTY_STATE)).toBeVisible();
  });
});
