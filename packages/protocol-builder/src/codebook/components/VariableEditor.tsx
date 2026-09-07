import { Lock, Plus, Trash2 } from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  VARIABLE_REFERENCE_VALIDATIONS,
  VARIABLE_TYPE_VALIDATIONS,
  type VariableOption,
  type VariableType,
  VariableTypes,
} from '@codaco/protocol-validation';
import { canonicalize, type SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildCreateVariableRequest,
  buildUpdateVariableRequest,
  InvalidCodebookDraftError,
  type AuxiliaryCodebookDraftFailure,
  type CodebookDraftIssue,
  type CodebookSubject,
  type CodebookVariableDraft,
} from '../editing.ts';

/**
 * What each kind of attribute is offered as.
 *
 * Keyed by the schema's own name for the type, and read through the option
 * list below, so what the editor OFFERS and what a stored variable IS are the
 * same list read twice. "Date" names the `datetime` type, which is what a
 * researcher calls it.
 */
const VARIABLE_TYPE_LABELS = defineMessages({
  text: {
    id: 'protocolBuilder.codebookVariable.typeText',
    defaultMessage: 'Text',
    description:
      'Choice offered for what an attribute records: free text typed by a participant.',
  },
  number: {
    id: 'protocolBuilder.codebookVariable.typeNumber',
    defaultMessage: 'Number',
    description:
      'Choice offered for what an attribute records: a number entered by a participant.',
  },
  boolean: {
    id: 'protocolBuilder.codebookVariable.typeBoolean',
    defaultMessage: 'Boolean',
    description:
      'Choice offered for what an attribute records: a true or false answer.',
  },
  ordinal: {
    id: 'protocolBuilder.codebookVariable.typeOrdinal',
    defaultMessage: 'Ordinal',
    description:
      'Choice offered for what an attribute records: one option from a list whose order is meaningful, such as a rating.',
  },
  categorical: {
    id: 'protocolBuilder.codebookVariable.typeCategorical',
    defaultMessage: 'Categorical',
    description:
      'Choice offered for what an attribute records: one or more options from an unordered list.',
  },
  scalar: {
    id: 'protocolBuilder.codebookVariable.typeScalar',
    defaultMessage: 'Scalar',
    description:
      'Choice offered for what an attribute records: a position on a continuous scale, such as a slider.',
  },
  datetime: {
    id: 'protocolBuilder.codebookVariable.typeDatetime',
    defaultMessage: 'Date',
    description:
      'Choice offered for what an attribute records: a date. The schema calls this type datetime; researchers call it a date.',
  },
  layout: {
    id: 'protocolBuilder.codebookVariable.typeLayout',
    defaultMessage: 'Layout',
    description:
      'Choice offered for what an attribute records: where a network member sits on a canvas the participant arranges.',
  },
  location: {
    id: 'protocolBuilder.codebookVariable.typeLocation',
    defaultMessage: 'Location',
    description:
      'Choice offered for what an attribute records: a place on a map.',
  },
});

const VARIABLE_TYPE_OPTIONS = [
  { label: VARIABLE_TYPE_LABELS.text, value: VariableTypes.text },
  { label: VARIABLE_TYPE_LABELS.number, value: VariableTypes.number },
  { label: VARIABLE_TYPE_LABELS.boolean, value: VariableTypes.boolean },
  { label: VARIABLE_TYPE_LABELS.ordinal, value: VariableTypes.ordinal },
  { label: VARIABLE_TYPE_LABELS.categorical, value: VariableTypes.categorical },
  { label: VARIABLE_TYPE_LABELS.scalar, value: VariableTypes.scalar },
  { label: VARIABLE_TYPE_LABELS.datetime, value: VariableTypes.datetime },
  { label: VARIABLE_TYPE_LABELS.layout, value: VariableTypes.layout },
  { label: VARIABLE_TYPE_LABELS.location, value: VariableTypes.location },
] as const satisfies readonly Readonly<{
  label: MessageDescriptor;
  value: VariableType;
}>[];

const messages = defineMessages({
  createTitle: {
    id: 'protocolBuilder.codebookVariable.createTitle',
    defaultMessage: 'Create attribute',
    description:
      'Heading of the editor while a new attribute (a codebook variable) is being added to an entity.',
  },
  editTitle: {
    id: 'protocolBuilder.codebookVariable.editTitle',
    defaultMessage: 'Edit attribute',
    description:
      'Heading of the editor while an existing attribute (a codebook variable) is being changed.',
  },
  description: {
    id: 'protocolBuilder.codebookVariable.description',
    defaultMessage:
      'Define the attribute name, data type, and any available values.',
    description:
      'Sentence under the editor heading saying what the researcher decides here. Available values are the options a participant may choose from.',
  },
  failureTitle: {
    id: 'protocolBuilder.codebookVariable.failureTitle',
    defaultMessage: 'Attribute not saved',
    description:
      'Heading of the alert shown when saving an attribute (a codebook variable) was refused. The reason follows underneath.',
  },
  staleTitle: {
    id: 'protocolBuilder.codebookVariable.staleTitle',
    defaultMessage: 'The codebook changed',
    description:
      'Heading of the warning shown when the protocol’s codebook changed elsewhere while this attribute editor was open.',
  },
  staleDescription: {
    id: 'protocolBuilder.codebookVariable.staleDescription',
    defaultMessage:
      'A newer version arrived while you were editing. Your draft has been preserved; review it before trying again.',
    description:
      'What to do after the protocol’s codebook changed elsewhere while this attribute editor was open.',
  },
  savedTitle: {
    id: 'protocolBuilder.codebookVariable.savedTitle',
    defaultMessage: 'Attribute saved',
    description:
      'Heading of the confirmation shown once the attribute has been accepted and the editor is waiting for the saved version to arrive back.',
  },
  savedDescription: {
    id: 'protocolBuilder.codebookVariable.savedDescription',
    defaultMessage:
      'Waiting for the host to publish the authoritative codebook update.',
    description:
      'Shown after an attribute is accepted, while the application it is being edited in finishes writing the change back into the protocol.',
  },
  submittingStatus: {
    id: 'protocolBuilder.codebookVariable.submittingStatus',
    defaultMessage: 'Saving attribute.',
    description:
      'Announced to screen reader users while the attribute is being saved. Not shown on screen.',
  },
  nameLabel: {
    id: 'protocolBuilder.codebookVariable.nameLabel',
    defaultMessage: 'Attribute name',
    description:
      'Label of the field holding the researcher’s own name for this attribute (a codebook variable).',
  },
  nameHint: {
    id: 'protocolBuilder.codebookVariable.nameHint',
    defaultMessage:
      'This name is used when referring to the attribute and in exported data.',
    description:
      'Guidance under the attribute name field. Exported data is the file a researcher analyses after the interviews.',
  },
  typeLabel: {
    id: 'protocolBuilder.codebookVariable.typeLabel',
    defaultMessage: 'Attribute type',
    description:
      'Label of the field choosing what kind of answer this attribute records.',
  },
  typePlaceholder: {
    id: 'protocolBuilder.codebookVariable.typePlaceholder',
    defaultMessage: 'Select an attribute type',
    description:
      'Placeholder shown in the attribute type field before a choice is made.',
  },
  typeChangedElsewhere: {
    id: 'protocolBuilder.codebookVariable.typeChangedElsewhere',
    defaultMessage:
      'The attribute type changed elsewhere. Close and reopen this editor before saving.',
    description:
      'Refusal shown under the attribute type field when someone else changed the type while this editor was open, which the draft in front of the researcher no longer matches.',
  },
  optionsLegend: {
    id: 'protocolBuilder.codebookVariable.optionsLegend',
    defaultMessage: 'Allowed values',
    description:
      'Heading over the list of answers a participant may choose from for this attribute. A required marker follows it.',
  },
  optionsHint: {
    id: 'protocolBuilder.codebookVariable.optionsHint',
    defaultMessage:
      'Add at least two participant-facing labels and their stored values.',
    description:
      'Guidance under the allowed values heading. A label is what a participant reads; its stored value is what the export records.',
  },
  optionLabelField: {
    id: 'protocolBuilder.codebookVariable.optionLabelField',
    defaultMessage: 'Option {index} label',
    description:
      'Label of the field holding what a participant reads for one allowed answer. index is that answer’s position in the list, counting from one, and is passed as text because the researcher reads it as this row’s name.',
  },
  optionValueField: {
    id: 'protocolBuilder.codebookVariable.optionValueField',
    defaultMessage: 'Option {index} value',
    description:
      'Label of the field holding what the export records for one allowed answer. index is that answer’s position in the list, counting from one, and is passed as text because the researcher reads it as this row’s name.',
  },
  removeOption: {
    id: 'protocolBuilder.codebookVariable.removeOption',
    defaultMessage: 'Remove option {index}',
    description:
      'Accessible name of the button that deletes one allowed answer. index is that answer’s position in the list, counting from one, and is passed as text because the researcher reads it as this row’s name.',
  },
  addOption: {
    id: 'protocolBuilder.codebookVariable.addOption',
    defaultMessage: 'Add option',
    description:
      'Button that adds an empty row to the list of answers a participant may choose from.',
  },
  createSubmit: {
    id: 'protocolBuilder.codebookVariable.createSubmit',
    defaultMessage: 'Create attribute',
    description:
      'Button that saves a newly added attribute (a codebook variable).',
  },
  saveSubmit: {
    id: 'protocolBuilder.codebookVariable.saveSubmit',
    defaultMessage: 'Save attribute',
    description:
      'Button that saves the changes to an existing attribute (a codebook variable).',
  },
  lockedOptionsCaption: {
    id: 'protocolBuilder.codebookVariable.lockedOptionsCaption',
    defaultMessage:
      'These values are managed by the interface and cannot be changed.',
    description:
      'Caption over the read-only list of allowed answers for an attribute whose answers one kind of interview step owns. An interface is one kind of interview step.',
  },
  lockedOptionLabelHeader: {
    id: 'protocolBuilder.codebookVariable.lockedOptionLabelHeader',
    defaultMessage: 'Label',
    description:
      'Column heading over what a participant reads for each allowed answer, in the read-only list of answers an interview step owns.',
  },
  lockedOptionValueHeader: {
    id: 'protocolBuilder.codebookVariable.lockedOptionValueHeader',
    defaultMessage: 'Value',
    description:
      'Column heading over what the export records for each allowed answer, in the read-only list of answers an interview step owns.',
  },
  blockedFailure: {
    id: 'protocolBuilder.codebookVariable.blockedFailure',
    defaultMessage:
      'The edit is blocked by {blockers}. Your draft has been preserved.',
    description:
      'Why saving an attribute could not go ahead: other people hold parts of the protocol the change needs. blockers is that list, already joined for the reader’s language; each entry names a person and the part they hold.',
  },
  failureWithReason: {
    id: 'protocolBuilder.codebookVariable.failureWithReason',
    defaultMessage: '{reason} Your draft has been preserved.',
    description:
      'Wraps the reason a save was refused with the reassurance that nothing typed has been lost. reason is a complete sentence written elsewhere — by this package or by the application the editor is running in — and already ends in its own punctuation.',
  },
});

const OPTION_TYPES = new Set<VariableType>([
  VariableTypes.ordinal,
  VariableTypes.categorical,
]);

const VARIABLE_EDITOR_PROPERTIES = ['name', 'type', 'options'] as const;
const TYPE_OWNED_PROPERTIES = [
  'component',
  'parameters',
  'validation',
  'encrypted',
] as const;

type EditableOption = Readonly<{
  label: string;
  value: string | number;
}>;

type VariableEditorCommonProps = Readonly<{
  /**
   * A stable identity for this opening of the editor. The host must change it
   * for every open, even when a closing animation has not finished. The keyed
   * inner editor then receives a fresh auxiliary draft session synchronously.
   */
  openId: string | number;
  subject: CodebookSubject;
  authoritativeDocument: Readonly<SectionDoc>;
  variableId: string;
  initialDraft: CodebookVariableDraft;
  description: string;
  createRequestId(): string;
  onSubmitRequest(
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult> | CompoundEditResult;
  /** Receives the stable record id after the compound edit is accepted. */
  onComplete(variableId: string): void;
  onDraftChange?(draft: CodebookVariableDraft): void;
  allowedVariableTypes?: readonly VariableType[];
  lockedOptions?: readonly VariableOption[] | null;
  readOnly?: boolean;
  title?: string;
}>;

export type VariableEditorProps =
  | (VariableEditorCommonProps &
      Readonly<{
        mode: 'create';
        protocolContext: ProtocolBuilderProtocolContext;
      }>)
  | (VariableEditorCommonProps &
      Readonly<{
        mode: 'update';
        protocolContext?: never;
      }>);

type VariableEditorInstanceProps = VariableEditorProps extends infer TProps
  ? TProps extends VariableEditorProps
    ? Omit<TProps, 'openId'>
    : never
  : never;

/**
 * Host-neutral editor for a codebook variable's identity, type and options.
 * Validation rules deliberately belong to the separate variable-validation
 * surface; any unrendered draft properties are preserved and validated by the
 * request builder rather than silently normalised here.
 */
export default function VariableEditor(props: VariableEditorProps) {
  const { openId, ...instanceProps } = props;
  return <VariableEditorInstance key={openId} {...instanceProps} />;
}

function VariableEditorInstance(props: VariableEditorInstanceProps) {
  const {
    subject,
    authoritativeDocument,
    variableId,
    initialDraft,
    description,
    createRequestId,
    onSubmitRequest,
    onComplete,
    onDraftChange,
    allowedVariableTypes,
    lockedOptions = null,
    readOnly = false,
  } = props;
  const intl = useAppIntl();
  const title =
    props.title ??
    intl.formatMessage(
      props.mode === 'create' ? messages.createTitle : messages.editTitle,
    );
  // This component is remounted by openId. Changing seeds within one open
  // must not overwrite edits already in progress.
  const [seededDraft] = useState(() =>
    draftWithLockedOptions(initialDraft, lockedOptions),
  );
  const [initialAuthoritativeType] = useState(() =>
    props.mode === 'update'
      ? variableTypeFrom(
          variableFromDocument(authoritativeDocument, variableId)?.type,
        )
      : null,
  );
  const [draftSession] = useState(
    () =>
      new AuxiliaryCodebookDraftSession(
        seededDraft,
        props.mode === 'update'
          ? variableFromDocument(authoritativeDocument, variableId)
          : null,
      ),
  );
  const subscribe = useCallback(
    (listener: () => void) => draftSession.subscribe(listener),
    [draftSession],
  );
  const getSnapshot = useCallback(
    () => draftSession.getSnapshot(),
    [draftSession],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [issues, setIssues] = useState<readonly CodebookDraftIssue[]>([]);
  const activeRequestId = useRef<string | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const previousAuthoritativeDocument = useRef(authoritativeDocument);
  const optionKeySequence = useRef(0);
  const [optionKeys, setOptionKeys] = useState(() =>
    readEditableOptions(seededDraft.options).map(
      () => `initial-option-${optionKeySequence.current++}`,
    ),
  );
  const options = readEditableOptions(snapshot.draft.options);
  const selectedType = variableTypeFrom(snapshot.draft.type);
  const currentAuthoritativeVariable =
    props.mode === 'update'
      ? variableFromDocument(authoritativeDocument, variableId)
      : null;
  const authoritativeType = variableTypeFrom(
    currentAuthoritativeVariable?.type,
  );
  const authoritativeTypeConflict =
    props.mode === 'update' && authoritativeType !== initialAuthoritativeType;
  const typeChanged =
    props.mode === 'update' && selectedType !== authoritativeType;
  const replaceProperties = variableEditorReplaceProperties(typeChanged);
  const submittedDraft =
    props.mode === 'create'
      ? snapshot.draft
      : draftOwnedByVariableEditor(
          snapshot.draft,
          lockedOptions !== null,
          typeChanged,
        );
  const hasOptions = selectedType !== null && OPTION_TYPES.has(selectedType);
  const optionsLocked =
    lockedOptions !== null || snapshot.draft.readOnly === true;
  const interactionDisabled = readOnly || snapshot.status !== 'editing';
  const unchangedUpdate =
    props.mode === 'update' &&
    currentAuthoritativeVariable !== null &&
    updateLeavesVariableUnchanged(
      currentAuthoritativeVariable,
      submittedDraft,
      replaceProperties,
    );
  const statusId = useId();

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (
      props.mode !== 'update' ||
      previousAuthoritativeDocument.current === authoritativeDocument
    ) {
      return;
    }
    const previousDocument = previousAuthoritativeDocument.current;
    previousAuthoritativeDocument.current = authoritativeDocument;
    if (
      canonicalize(previousDocument) !== canonicalize(authoritativeDocument)
    ) {
      activeRequestId.current = null;
    }
    const authoritativeVariable = variableFromDocument(
      authoritativeDocument,
      variableId,
    );
    if (authoritativeVariable !== null) {
      draftSession.receiveAuthoritative(authoritativeVariable);
    }
  }, [authoritativeDocument, draftSession, props.mode, variableId]);

  useEffect(() => {
    setOptionKeys((current) => {
      if (current.length === options.length) return current;
      if (current.length > options.length)
        return current.slice(0, options.length);
      return [
        ...current,
        ...Array.from(
          { length: options.length - current.length },
          () => `synced-option-${optionKeySequence.current++}`,
        ),
      ];
    });
  }, [options.length]);

  useEffect(() => {
    if (snapshot.lastFailure !== null) failureRef.current?.focus();
  }, [snapshot.lastFailure]);

  const typeOptions = useMemo(() => {
    const allowed = new Set(
      allowedVariableTypes ?? VARIABLE_TYPE_OPTIONS.map(({ value }) => value),
    );
    if (selectedType !== null) allowed.add(selectedType);
    return VARIABLE_TYPE_OPTIONS.filter(({ value }) => allowed.has(value)).map(
      ({ label, value }) => ({ label: intl.formatMessage(label), value }),
    );
  }, [allowedVariableTypes, intl, selectedType]);

  const replaceDraft = useCallback(
    (nextDraft: CodebookVariableDraft) => {
      activeRequestId.current = null;
      setIssues([]);
      draftSession.replaceDraft(nextDraft);
      onDraftChange?.(nextDraft);
    },
    [draftSession, onDraftChange],
  );

  const replaceProperty = useCallback(
    (property: string, value: unknown) => {
      replaceDraft({ ...snapshot.draft, [property]: value });
    },
    [replaceDraft, snapshot.draft],
  );

  const replaceOptions = useCallback(
    (nextOptions: readonly EditableOption[]) => {
      replaceProperty(
        'options',
        nextOptions.map((option) => ({ ...option })),
      );
    },
    [replaceProperty],
  );

  const handleTypeChange = (value: string | number | undefined) => {
    const nextType = variableTypeFrom(value);
    if (nextType === null) return;
    replaceDraft(draftForType(snapshot.draft, nextType));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (interactionDisabled) return;
    if (authoritativeTypeConflict) {
      activeRequestId.current = null;
      setIssues([
        {
          path: ['type'],
          message: intl.formatMessage(messages.typeChangedElsewhere),
        },
      ]);
      return;
    }
    if (unchangedUpdate) return;
    setIssues([]);
    const requestId = activeRequestId.current ?? createRequestId();
    activeRequestId.current = requestId;

    const buildRequest =
      props.mode === 'create'
        ? () =>
            buildCreateVariableRequest({
              requestId,
              description,
              subject,
              authoritativeDocument,
              variableId,
              protocolContext: props.protocolContext,
              draft: submittedDraft,
            })
        : () =>
            buildUpdateVariableRequest({
              requestId,
              description,
              subject,
              authoritativeDocument,
              variableId,
              draft: submittedDraft,
              replaceProperties,
            });

    try {
      const result = await draftSession.submit(buildRequest, onSubmitRequest);
      if (
        result.status === 'failed' &&
        (result.reason === 'stale-epoch' ||
          result.reason === 'lease-lost' ||
          result.reason === 'stale-base')
      ) {
        activeRequestId.current = null;
      }
      if (
        result.status === 'applied' &&
        !draftSession.getSnapshot().authoritativeChanged
      ) {
        onComplete(variableId);
      }
    } catch (error: unknown) {
      if (error instanceof InvalidCodebookDraftError) {
        setIssues(error.issues);
      }
      // AuxiliaryCodebookDraftSession stores and announces the failure. The
      // form deliberately remains mounted with the exact rejected draft.
    }
  };

  const nameErrors = messagesAt(issues, 'name');
  const typeErrors = messagesAt(issues, 'type');
  const optionErrors = messagesAt(issues, 'options');
  const failurePresentation = failureFrom(snapshot.lastFailure, intl);

  return (
    <Surface
      as="section"
      noContainer
      spacing="md"
      shadow="sm"
      className="w-full overflow-visible!"
      aria-labelledby={`${statusId}-title`}
      data-status={snapshot.status}
    >
      <Heading id={`${statusId}-title`} level="h3" margin="none">
        {title}
      </Heading>
      <Paragraph emphasis="muted" className="mt-2">
        {intl.formatMessage(messages.description)}
      </Paragraph>

      {failurePresentation !== null && (
        <Alert
          ref={failureRef}
          tabIndex={-1}
          variant={failurePresentation.variant}
          className="focusable"
        >
          <AlertTitle>{intl.formatMessage(messages.failureTitle)}</AlertTitle>
          <AlertDescription>{failurePresentation.message}</AlertDescription>
        </Alert>
      )}
      {snapshot.authoritativeChanged && (
        <Alert variant="warning">
          <AlertTitle>{intl.formatMessage(messages.staleTitle)}</AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.staleDescription)}
          </AlertDescription>
        </Alert>
      )}
      {snapshot.status === 'awaiting-authoritative' && (
        <Alert variant="success">
          <AlertTitle>{intl.formatMessage(messages.savedTitle)}</AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.savedDescription)}
          </AlertDescription>
        </Alert>
      )}
      {snapshot.status === 'submitting' && (
        <p role="status" className="sr-only">
          {intl.formatMessage(messages.submittingStatus)}
        </p>
      )}

      <form className="mt-8" onSubmit={(event) => void handleSubmit(event)}>
        <UnconnectedField
          name="variable-name"
          label={intl.formatMessage(messages.nameLabel)}
          hint={intl.formatMessage(messages.nameHint)}
          component={InputField}
          value={
            typeof snapshot.draft.name === 'string' ? snapshot.draft.name : ''
          }
          onChange={(value) => replaceProperty('name', value ?? '')}
          autoFocus={!readOnly}
          required
          readOnly={interactionDisabled}
          errors={nameErrors}
          showErrors={nameErrors.length > 0}
        />
        <UnconnectedField
          name="variable-type"
          label={intl.formatMessage(messages.typeLabel)}
          component={NativeSelectField}
          placeholder={intl.formatMessage(messages.typePlaceholder)}
          options={typeOptions}
          value={selectedType ?? ''}
          onChange={handleTypeChange}
          required
          readOnly={interactionDisabled || optionsLocked}
          errors={typeErrors}
          showErrors={typeErrors.length > 0}
        />

        {hasOptions && (
          <fieldset
            className="mb-8 min-w-0"
            aria-invalid={optionErrors.length > 0 || undefined}
            aria-describedby={
              optionErrors.length > 0 ? `${statusId}-option-errors` : undefined
            }
          >
            <legend className="font-heading mb-2 font-bold">
              {intl.formatMessage(messages.optionsLegend)}{' '}
              <span className="text-destructive">*</span>
            </legend>
            <p className="text-muted mb-4 text-sm">
              {intl.formatMessage(messages.optionsHint)}
            </p>
            {optionsLocked ? (
              <LockedOptions options={options} />
            ) : (
              <div className="flex flex-col gap-4">
                {options.map((option, index) => (
                  <Surface
                    key={optionKeys[index] ?? `option-${index}`}
                    noContainer
                    spacing="sm"
                    shadow="xs"
                    series="accent"
                    className="w-full overflow-visible!"
                  >
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <UnconnectedField
                          name={`option-${index + 1}-label`}
                          label={intl.formatMessage(
                            messages.optionLabelField,
                            // The one-based position is passed as text, not as
                            // a number: the researcher reads it as this row's
                            // name, and a grouped thousands separator would
                            // make it a different name.
                            { index: String(index + 1) },
                          )}
                          component={InputField}
                          value={option.label}
                          onChange={(label) => {
                            const next = [...options];
                            next[index] = { ...option, label: label ?? '' };
                            replaceOptions(next);
                          }}
                          required
                          readOnly={interactionDisabled}
                        />
                        <UnconnectedField
                          name={`option-${index + 1}-value`}
                          label={intl.formatMessage(messages.optionValueField, {
                            index: String(index + 1),
                          })}
                          component={InputField}
                          value={String(option.value)}
                          onChange={(value) => {
                            const next = [...options];
                            next[index] = {
                              ...option,
                              value: parseOptionValue(value ?? ''),
                            };
                            replaceOptions(next);
                          }}
                          required
                          readOnly={interactionDisabled}
                        />
                      </div>
                      <IconButton
                        icon={<Trash2 aria-hidden="true" />}
                        aria-label={intl.formatMessage(messages.removeOption, {
                          index: String(index + 1),
                        })}
                        color="destructive"
                        disabled={interactionDisabled}
                        onClick={() => {
                          setOptionKeys((current) =>
                            current.filter((_, keyIndex) => keyIndex !== index),
                          );
                          replaceOptions(
                            options.filter(
                              (_, optionIndex) => optionIndex !== index,
                            ),
                          );
                        }}
                      />
                    </div>
                  </Surface>
                ))}
                <Button
                  type="button"
                  variant="dashed"
                  color="primary"
                  icon={<Plus aria-hidden="true" />}
                  disabled={interactionDisabled}
                  onClick={() => {
                    setOptionKeys((current) => [
                      ...current,
                      `new-option-${optionKeySequence.current++}`,
                    ]);
                    replaceOptions([...options, { label: '', value: '' }]);
                  }}
                >
                  {intl.formatMessage(messages.addOption)}
                </Button>
              </div>
            )}
            {optionErrors.length > 0 && (
              <ul
                id={`${statusId}-option-errors`}
                className="text-destructive mt-3 list-disc pl-5"
              >
                {/* An option issue's message is a plain string carrying either
                    this package's own encoded descriptor or a wording the
                    schema wrote, and this list is our own markup rather than a
                    field's error region, so it is decoded here and passed
                    through untouched when it is not one of ours. */}
                {optionErrors.map((message) => (
                  <li key={message}>
                    {formatMessageError(message, intl) ?? message}
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            color="primary"
            disabled={interactionDisabled || unchangedUpdate}
            aria-busy={snapshot.status === 'submitting'}
          >
            {intl.formatMessage(
              props.mode === 'create'
                ? messages.createSubmit
                : messages.saveSubmit,
            )}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

function draftWithLockedOptions(
  draft: CodebookVariableDraft,
  lockedOptions: readonly VariableOption[] | null,
): CodebookVariableDraft {
  if (lockedOptions === null) return draft;
  return {
    ...draft,
    options: lockedOptions.map((option) => ({ ...option })),
    readOnly: true,
  };
}

function draftOwnedByVariableEditor(
  draft: Readonly<SectionDoc>,
  persistLockedOptions: boolean,
  includeTypeMetadata: boolean,
): CodebookVariableDraft {
  const owned: Record<string, unknown> = Object.create(null);
  const properties = includeTypeMetadata
    ? [...VARIABLE_EDITOR_PROPERTIES, ...TYPE_OWNED_PROPERTIES]
    : VARIABLE_EDITOR_PROPERTIES;
  for (const property of properties) {
    if (Object.hasOwn(draft, property)) owned[property] = draft[property];
  }
  if (persistLockedOptions) owned.readOnly = true;
  return owned;
}

function variableEditorReplaceProperties(
  includeTypeMetadata: boolean,
): readonly string[] {
  return includeTypeMetadata
    ? [...VARIABLE_EDITOR_PROPERTIES, ...TYPE_OWNED_PROPERTIES]
    : VARIABLE_EDITOR_PROPERTIES;
}

function updateLeavesVariableUnchanged(
  authoritativeVariable: Readonly<SectionDoc>,
  submittedDraft: Readonly<SectionDoc>,
  replaceProperties: readonly string[],
): boolean {
  const nextVariable: Record<string, unknown> = {
    ...authoritativeVariable,
  };
  for (const property of replaceProperties) delete nextVariable[property];
  for (const [property, value] of Object.entries(submittedDraft)) {
    nextVariable[property] = value;
  }
  return canonicalize(nextVariable) === canonicalize(authoritativeVariable);
}

function draftForType(
  draft: Readonly<SectionDoc>,
  nextType: VariableType,
): CodebookVariableDraft {
  if (draft.type === nextType) return draft;
  const next: Record<string, unknown> = { ...draft, type: nextType };

  // Input controls and their parameters are selected for one variable type;
  // no component name or parameter shape is portable across a type change.
  delete next.component;
  delete next.parameters;

  // Keep only target-supported, value-independent rules. Reference rules can
  // become cross-class comparisons after a type change, so they must be
  // re-authored against a compatible target in the validation editor.
  const validation = isRecord(next.validation)
    ? Object.fromEntries(
        Object.entries(next.validation).filter(
          ([rule]) =>
            Object.hasOwn(VARIABLE_TYPE_VALIDATIONS[nextType], rule) &&
            !VARIABLE_REFERENCE_VALIDATIONS.some(
              (referenceRule) => referenceRule === rule,
            ),
        ),
      )
    : null;
  if (validation !== null && Object.keys(validation).length > 0) {
    next.validation = validation;
  } else {
    delete next.validation;
  }

  // Encryption round-trips strings and is valid only for node text values.
  if (nextType !== VariableTypes.text) delete next.encrypted;

  if (OPTION_TYPES.has(nextType)) {
    const previousType = variableTypeFrom(draft.type);
    if (previousType === null || !OPTION_TYPES.has(previousType)) {
      next.options = [];
    }
  } else {
    delete next.options;
  }
  return next;
}

function variableFromDocument(
  document: Readonly<SectionDoc>,
  variableId: string,
): Readonly<SectionDoc> | null {
  if (!isRecord(document.variables)) return null;
  const variable = document.variables[variableId];
  return isRecord(variable) ? variable : null;
}

function readEditableOptions(value: unknown): EditableOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((option) => ({
    label:
      isRecord(option) && typeof option.label === 'string' ? option.label : '',
    value:
      isRecord(option) &&
      (typeof option.value === 'string' || typeof option.value === 'number')
        ? option.value
        : '',
  }));
}

function parseOptionValue(value: string): string | number {
  const normalized = value.normalize('NFC');
  if (/^-?(?:0|[1-9]\d*)$/.test(normalized)) {
    const numberValue = Number(normalized);
    if (Number.isSafeInteger(numberValue)) return numberValue;
  }
  return normalized;
}

function variableTypeFrom(value: unknown): VariableType | null {
  for (const option of VARIABLE_TYPE_OPTIONS) {
    if (option.value === value) return option.value;
  }
  return null;
}

function messagesAt(
  issues: readonly CodebookDraftIssue[],
  property: string,
): string[] {
  return issues
    .filter((issue) => issue.path[0] === property)
    .map((issue) => issue.message);
}

/**
 * `intl` rather than `useAppIntl()` inside, because the refusal being
 * presented reaches here as a plain string: a compound edit's `message` is
 * either this package's own encoded descriptor or a host's already-written
 * sentence, and `formatMessageError(…) ?? text` is what tells them apart.
 */
function failureFrom(
  failure: AuxiliaryCodebookDraftFailure | null,
  intl: IntlShape,
): Readonly<{
  variant: 'warning' | 'destructive';
  message: string;
}> | null {
  if (failure === null) return null;
  if (failure.kind === 'error') {
    return {
      variant: 'destructive',
      message: formatMessageError(failure.message, intl) ?? failure.message,
    };
  }
  if (failure.result.status === 'blocked') {
    const blockers = failure.result.blockedSections.map(
      ({ sectionId, holder }) =>
        holder === undefined
          ? sectionId
          : `${holder.displayName} (${sectionId})`,
    );
    return {
      variant: 'warning',
      // Joined by the formatter rather than by `', '`: which separator a list
      // takes, and whether the last item gets a word before it, is the
      // reader's language's business. English gains an "and": "a, b, and c".
      message: intl.formatMessage(messages.blockedFailure, {
        blockers: intl.formatList(blockers),
      }),
    };
  }
  const reason =
    formatMessageError(failure.result.message, intl) ?? failure.result.message;
  return {
    variant: 'destructive',
    message: intl.formatMessage(messages.failureWithReason, { reason }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function LockedOptions({ options }: { options: readonly EditableOption[] }) {
  const intl = useAppIntl();
  return (
    <div className="bg-surface-2 text-surface-2-contrast relative rounded p-4">
      <Lock aria-hidden="true" className="absolute top-4 right-4 size-4" />
      <table className="w-full text-sm">
        <caption className="pr-8 pb-2 text-left">
          {intl.formatMessage(messages.lockedOptionsCaption)}
        </caption>
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-bold">
              {intl.formatMessage(messages.lockedOptionLabelHeader)}
            </th>
            <th className="pb-2 font-bold">
              {intl.formatMessage(messages.lockedOptionValueHeader)}
            </th>
          </tr>
        </thead>
        <tbody>
          {options.map((option, index) => (
            <tr key={`${String(option.value)}-${index}`}>
              <td className="py-1">{option.label}</td>
              <td className="font-monospace py-1">{String(option.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
