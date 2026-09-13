import { type ReactNode, useId, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl, useAppLocale } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Form from '@codaco/fresco-ui/form/Form';
import {
  useFormHasValue,
  useFormValue,
} from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  createInitialNetwork,
  InterviewI18nProvider,
  ProtocolField,
  type ProtocolFieldDefinition,
} from '@codaco/interview';
import {
  type ComponentType,
  ComponentTypesKeys,
  type Variable,
} from '@codaco/protocol-validation';

import {
  completeRuleValues,
  variableTypeForComponent,
} from '../../codebook/variableValidation.ts';
import type { RowValues } from '../../form/rowDialog.tsx';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { asText } from '../canvas/rowValues.ts';
import {
  controlsForType,
  isCollectableType,
  isOptionType,
} from '../collectableTypes.ts';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.fieldPreview.title',
    defaultMessage: 'Interactive preview',
    description:
      'Accessible name and heading of the half of the form-field dialog that shows the question as the participant will meet it.',
  },
  description: {
    id: 'protocolBuilder.fieldPreview.description',
    defaultMessage:
      'Try the field as a participant. Use Check response to test its current validation rules.',
    description:
      'Explains what the preview beside a form field’s settings is for: it can be answered, and answering it runs the rules the attribute carries. "Check response" is the button below it, named by the checkResponse message.',
  },
  checkResponse: {
    id: 'protocolBuilder.fieldPreview.checkResponse',
    defaultMessage: 'Check response',
    description:
      'Button inside the preview of a form field that submits the researcher’s trial answer so the attribute’s validation rules run against it.',
  },
  empty: {
    id: 'protocolBuilder.fieldPreview.empty',
    defaultMessage:
      'Select an attribute and input control to preview this field.',
    description:
      'Shown in place of the preview of a form field while the two things it would need to render — which attribute the answer is recorded under, and which control collects it — have not both been chosen.',
  },
  sharedAttribute: {
    id: 'protocolBuilder.fieldPreview.sharedAttribute',
    defaultMessage:
      'When selecting an existing attribute, changes you make to the input control or validation options will also change other uses of this attribute.',
    description:
      'Notice shown in the preview of a form field bound to an attribute the codebook already holds, because the control and the rules belong to that attribute rather than to this one question.',
  },
  placeholderLabel: {
    id: 'protocolBuilder.fieldPreview.placeholderLabel',
    defaultMessage: 'Attribute label',
    description:
      'Stands in for the label of a network composer’s form field in its preview, while the researcher has authored none and the attribute it collects has no name to borrow.',
  },
  placeholderQuestion: {
    id: 'protocolBuilder.fieldPreview.placeholderQuestion',
    defaultMessage: 'Your question will appear here.',
    description:
      'Stands in for the question of a form field in its preview, while the researcher has not written one yet.',
  },
});

/**
 * Row keys the preview follows as the researcher types.
 *
 * The union of both families' keys, and one list rather than two: a key the
 * family on screen never registers simply never has a live value, and asking
 * for it costs one `hasValue` read. The dialog-only spellings
 * (`_newVariableName`, `_newVariableType`, `_component`) are written out here
 * rather than imported from `FormFieldsSection`, which imports this module —
 * the same rule its own test follows, so a key that moves has to move in both
 * places.
 */
const PREVIEW_DRAFT_FIELDS = [
  'variable',
  '_newVariableName',
  '_newVariableType',
  '_component',
  'component',
  'parameters',
  'prompt',
  'label',
  'hint',
  'showValidationHints',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isInputControl = (value: unknown): value is ComponentType =>
  typeof value === 'string' &&
  ComponentTypesKeys.some((control) => control === value);

/**
 * What the researcher has actually written, by the interview's own rule.
 *
 * `@codaco/interview`'s `authoredFieldLabel` TRIMS before deciding whether
 * anything was authored, so a caption of nothing but spaces is nothing
 * authored and the participant meets the fallback — the attribute's name in a
 * composer, the stand-in sentence in a form. Read through `asText` first,
 * because a row may hold anything at all here.
 *
 * Replicated rather than imported: that helper is internal to the runtime and
 * its root entry does not export it. `FieldPreviewPane.test.tsx` pins the
 * three cases the runtime's own rule turns on — whitespace-only, empty, and
 * ordinary text — so the preview cannot caption a field the interview would
 * not.
 */
const authoredText = (value: unknown): string | undefined => {
  const text = asText(value)?.trim();
  return text === undefined || text === '' ? undefined : text;
};

/**
 * A trial answer is checked against the attribute's own rules and nothing
 * else. The preview's form has no document to save and no host to save it to,
 * so its submit exists only to make the field-level rules run.
 */
const passPreviewValidation = () => ({ success: true as const });

/**
 * The participant's own language and writing direction, around the field.
 *
 * A separate component because it reads the researcher-facing locale the
 * interview provider resolved, which is only available below it.
 */
function PreviewLocaleRegion({ children }: Readonly<{ children: ReactNode }>) {
  const { locale, direction } = useAppLocale();
  return (
    <div lang={locale} dir={direction}>
      {children}
    </div>
  );
}

export type FieldPreviewPaneProps = Readonly<{
  /** Whose codebook the previewed field collects into. */
  subject: CodebookSubject | undefined;
  /**
   * Which family's row this is.
   *
   * The two ask the participant differently: a form field asks a question, and
   * a network composer's field labels one box of a form the participant is
   * filling in — so what stands in while nothing is authored differs, and so
   * does where the chosen control lives.
   */
  mode?: 'form' | 'composer';
  /** The row as the dialog opened on it; see {@link RowValues}. */
  item: RowValues;
}>;

/**
 * The field being authored, as the participant will meet it.
 *
 * Rendered beside the row's own controls — `DialogForm`'s `aside` — and inside
 * the dialog's store, so it follows the draft without the row having to report
 * anything. Everything the interview decides about a field is the interview's
 * to decide here too: the control map, the swapped controls, the validation
 * adapter and the parameters all come from `@codaco/interview`'s own
 * `ProtocolField`, so a preview cannot quietly disagree with the interview
 * about what the researcher has authored.
 *
 * The value sets, rules and settings the preview needs are the ATTRIBUTE's,
 * and they are read from the live protocol rather than from the row: the
 * codebook editors beside this pane commit immediately, so an option added or
 * a rule tightened appears here without the dialog being reopened.
 */
export default function FieldPreviewPane({
  subject,
  mode = 'form',
  item,
}: FieldPreviewPaneProps) {
  const intl = useAppIntl();
  const headingId = useId();
  const liveValues = useFormValue(PREVIEW_DRAFT_FIELDS);
  // A field the dialog has not registered yet has no live value to show — the
  // dialog opens before its sections mount, and a control the row does not
  // offer never mounts at all — so the committed row stands until it does.
  // That is what separates a field nothing has registered from one the
  // researcher has deliberately emptied.
  const hasLiveValue = useFormHasValue(PREVIEW_DRAFT_FIELDS);

  const draft = useMemo(() => {
    const values: Record<string, unknown> = { ...item };
    for (const name of PREVIEW_DRAFT_FIELDS) {
      if (hasLiveValue[name]) values[name] = liveValues[name];
    }
    return values;
  }, [hasLiveValue, item, liveValues]);

  const protocolContext = useProtocolContext();
  const variables =
    subject === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject);
  const network = useMemo(() => createInitialNetwork(), []);

  // An attribute being invented is a `variable` the codebook does not hold:
  // the create sentinel is spelled outside the alphabet an attribute's record
  // key may use, so the lookup misses and nothing has to know the sentinel.
  const variableId = asText(draft.variable);
  const codebookVariable: Readonly<Variable> | undefined =
    variableId === undefined ? undefined : variables?.[variableId];
  const inventedName = asText(draft._newVariableName);

  // The form family writes the control to the CODEBOOK, so a row reopened on a
  // field that already exists has none until its own control registers — the
  // attribute's is what the interview would render. A network composer's field
  // carries its own.
  const rowControl = mode === 'composer' ? draft.component : draft._component;
  const draftControl = isInputControl(rowControl) ? rowControl : undefined;
  const codebookControl: unknown = Reflect.get(
    codebookVariable ?? {},
    'component',
  );
  const attributeControl = isInputControl(codebookControl)
    ? codebookControl
    : undefined;

  // An attribute nobody has created yet has no type of its own, so the kind of
  // answer the researcher has said they want stands in — and failing that, the
  // one the chosen control implies, which is unambiguous.
  const variableType: string | undefined =
    codebookVariable?.type ??
    asText(draft._newVariableType) ??
    (draftControl === undefined
      ? undefined
      : variableTypeForComponent(draftControl));

  // The control has to be one this kind of answer allows. A row being rebound
  // still holds the control it was given for the attribute it USED to collect
  // for a render or two, and that pairing is not a field at all — the protocol
  // schema refuses it and the interview has no way to render it — so the
  // attribute's own control answers until the row's catches up.
  const allowsControl = (candidate: ComponentType): boolean =>
    variableType !== undefined &&
    controlsForType(variableType).some(({ value }) => value === candidate);
  const control =
    draftControl !== undefined && allowsControl(draftControl)
      ? draftControl
      : attributeControl !== undefined && allowsControl(attributeControl)
        ? attributeControl
        : undefined;

  const authoredLabel = authoredText(draft.label);
  const prompt = authoredText(draft.prompt);
  const label =
    mode === 'composer'
      ? (authoredLabel ??
        codebookVariable?.name ??
        inventedName ??
        variableId ??
        intl.formatMessage(messages.placeholderLabel))
      : (prompt ?? intl.formatMessage(messages.placeholderQuestion));

  const previewVariableId =
    codebookVariable === undefined
      ? (inventedName ?? 'preview-field')
      : (variableId ?? 'preview-field');

  const validationContext = useMemo(
    () =>
      subject === undefined
        ? undefined
        : {
            codebook: protocolContext.codebook,
            network,
            stageSubject: subject,
            variableLabels: { [previewVariableId]: label },
          },
    [label, network, previewVariableId, protocolContext.codebook, subject],
  );

  // The composer's field carries its own settings and the codebook's stand
  // behind them; everywhere else the schema keys them on the attribute's own
  // control, so the codebook's are the only ones there are. Same order the
  // interview reads them in.
  const attributeParameters: unknown = Reflect.get(
    codebookVariable ?? {},
    'parameters',
  );
  const parameters =
    mode === 'composer'
      ? (draft.parameters ?? attributeParameters)
      : attributeParameters;
  const rules = Reflect.get(codebookVariable ?? {}, 'validation');
  // Whatever the attribute offers, on the interview's own terms: it keeps a
  // boolean's two labels under the same key as a list's values, and decides
  // for itself which of them a swapped control still answers with.
  const attributeOptions: unknown = Reflect.get(
    codebookVariable ?? {},
    'options',
  );

  const field = useMemo<ProtocolFieldDefinition | null>(() => {
    // `isCollectableType` is the same question the row's own type picker asks:
    // a kind of answer a form can ask for. It rules out a half-typed invented
    // type, and the two kinds that hold a position rather than an answer and
    // have no participant-facing control at all.
    if (control === undefined || variableType === undefined) return null;
    if (!isCollectableType(variableType)) return null;

    // A list of answers is authored after the attribute that holds them, so
    // there is a real intermediate state with no values yet. An empty control
    // says so; the alternative is a preview that throws on `options.map`.
    const options = Array.isArray(attributeOptions)
      ? attributeOptions
      : isOptionType(variableType)
        ? []
        : undefined;
    const validation = isRecord(rules) ? completeRuleValues(rules) : undefined;

    return {
      variable: previewVariableId,
      label,
      type: variableType,
      component: control,
      ...(asText(draft.hint) === undefined ? {} : { hint: asText(draft.hint) }),
      ...(draft.showValidationHints === true && { showValidationHints: true }),
      ...(options === undefined ? {} : { options }),
      ...(isRecord(parameters) && { parameters }),
      ...(validation === undefined ? {} : { validation }),
    };
  }, [
    attributeOptions,
    control,
    draft.hint,
    draft.showValidationHints,
    label,
    parameters,
    previewVariableId,
    rules,
    variableType,
  ]);

  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} level="h3" margin="none">
        {intl.formatMessage(messages.title)}
      </Heading>
      <Paragraph className="mt-2 max-w-[65ch]">
        {intl.formatMessage(messages.description)}
      </Paragraph>
      {codebookVariable !== undefined && (
        <Alert variant="info" className="mt-4">
          <AlertDescription>
            {intl.formatMessage(messages.sharedAttribute)}
          </AlertDescription>
        </Alert>
      )}
      <ThemedRegion theme="interview" className="mt-4 rounded-lg">
        <Surface noContainer spacing="lg" shadow="lg" className="min-h-80">
          {field === null ? (
            <div className="flex min-h-56 items-center justify-center text-center">
              <Paragraph className="max-w-[36ch]" margin="none">
                {intl.formatMessage(messages.empty)}
              </Paragraph>
            </div>
          ) : (
            // Keyed on the pairing the interview resolves a control from, so
            // switching either starts the trial answer again rather than
            // handing a value authored for one control to another.
            <Form
              key={`${field.type}:${field.component}`}
              onSubmit={passPreviewValidation}
            >
              <InterviewI18nProvider requestedLocale={intl.locale}>
                <PreviewLocaleRegion>
                  {/* Re-parents the participant's own popups — a scale's
                      value bubble, a date picker — into the region that
                      carries their language and writing direction. */}
                  <PortalContainerProvider>
                    <ProtocolField
                      field={field}
                      name="preview-value"
                      {...(validationContext === undefined
                        ? {}
                        : { validationContext })}
                    />
                  </PortalContainerProvider>
                </PreviewLocaleRegion>
              </InterviewI18nProvider>
              <div className="flex justify-end">
                <Button type="submit">
                  {intl.formatMessage(messages.checkResponse)}
                </Button>
              </div>
            </Form>
          )}
        </Surface>
      </ThemedRegion>
    </section>
  );
}
