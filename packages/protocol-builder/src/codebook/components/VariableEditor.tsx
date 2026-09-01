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

const VARIABLE_TYPE_OPTIONS = [
  { label: 'Text', value: VariableTypes.text },
  { label: 'Number', value: VariableTypes.number },
  { label: 'Boolean', value: VariableTypes.boolean },
  { label: 'Ordinal', value: VariableTypes.ordinal },
  { label: 'Categorical', value: VariableTypes.categorical },
  { label: 'Scalar', value: VariableTypes.scalar },
  { label: 'Date', value: VariableTypes.datetime },
  { label: 'Layout', value: VariableTypes.layout },
  { label: 'Location', value: VariableTypes.location },
] as const satisfies readonly Readonly<{
  label: string;
  value: VariableType;
}>[];

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
    title = props.mode === 'create' ? 'Create attribute' : 'Edit attribute',
  } = props;
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
      ({ label, value }) => ({ label, value }),
    );
  }, [allowedVariableTypes, selectedType]);

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
          message:
            'The attribute type changed elsewhere. Close and reopen this editor before saving.',
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
  const failurePresentation = failureFrom(snapshot.lastFailure);

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
        Define the attribute name, data type, and any available values.
      </Paragraph>

      {failurePresentation !== null && (
        <Alert
          ref={failureRef}
          tabIndex={-1}
          variant={failurePresentation.variant}
          className="focusable"
        >
          <AlertTitle>Attribute not saved</AlertTitle>
          <AlertDescription>{failurePresentation.message}</AlertDescription>
        </Alert>
      )}
      {snapshot.authoritativeChanged && (
        <Alert variant="warning">
          <AlertTitle>The codebook changed</AlertTitle>
          <AlertDescription>
            A newer version arrived while you were editing. Your draft has been
            preserved; review it before trying again.
          </AlertDescription>
        </Alert>
      )}
      {snapshot.status === 'awaiting-authoritative' && (
        <Alert variant="success">
          <AlertTitle>Attribute saved</AlertTitle>
          <AlertDescription>
            Waiting for the host to publish the authoritative codebook update.
          </AlertDescription>
        </Alert>
      )}
      {snapshot.status === 'submitting' && (
        <p role="status" className="sr-only">
          Saving attribute.
        </p>
      )}

      <form className="mt-8" onSubmit={(event) => void handleSubmit(event)}>
        <UnconnectedField
          name="variable-name"
          label="Attribute name"
          hint="This name is used when referring to the attribute and in exported data."
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
          label="Attribute type"
          component={NativeSelectField}
          placeholder="Select an attribute type"
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
              Allowed values <span className="text-destructive">*</span>
            </legend>
            <p className="text-muted mb-4 text-sm">
              Add at least two participant-facing labels and their stored
              values.
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
                          label={`Option ${index + 1} label`}
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
                          label={`Option ${index + 1} value`}
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
                        aria-label={`Remove option ${index + 1}`}
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
                  Add option
                </Button>
              </div>
            )}
            {optionErrors.length > 0 && (
              <ul
                id={`${statusId}-option-errors`}
                className="text-destructive mt-3 list-disc pl-5"
              >
                {optionErrors.map((message) => (
                  <li key={message}>{message}</li>
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
            {props.mode === 'create' ? 'Create attribute' : 'Save attribute'}
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

function failureFrom(failure: AuxiliaryCodebookDraftFailure | null): Readonly<{
  variant: 'warning' | 'destructive';
  message: string;
}> | null {
  if (failure === null) return null;
  if (failure.kind === 'error') {
    return { variant: 'destructive', message: failure.message };
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
      message: `The edit is blocked by ${blockers.join(', ')}. Your draft has been preserved.`,
    };
  }
  return {
    variant: 'destructive',
    message: `${failure.result.message} Your draft has been preserved.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function LockedOptions({ options }: { options: readonly EditableOption[] }) {
  return (
    <div className="bg-surface-2 text-surface-2-contrast relative rounded p-4">
      <Lock aria-hidden="true" className="absolute top-4 right-4 size-4" />
      <table className="w-full text-sm">
        <caption className="pr-8 pb-2 text-left">
          These values are managed by the interface and cannot be changed.
        </caption>
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-bold">Label</th>
            <th className="pb-2 font-bold">Value</th>
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
