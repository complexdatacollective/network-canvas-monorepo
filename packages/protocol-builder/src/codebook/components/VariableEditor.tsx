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
import type { CompoundEditRequest } from '../../session.ts';
import { compoundFailureMessage } from '../compoundFailureCopy.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildCreateVariableRequest,
  buildUpdateVariableRequest,
  InvalidCodebookDraftError,
  type AuxiliaryCodebookDraftFailure,
  type AuxiliaryCodebookSubmitResult,
  type CodebookDraftIssue,
  type CodebookSubject,
  type CodebookVariableDraft,
} from '../editing.ts';
import {
  type BooleanAnswer,
  type BooleanAnswerIssues,
  hasBooleanAnswerIssues,
  optionsForShape,
  optionsShapeFor,
  type OptionsShape,
  readBooleanAnswers,
  validateBooleanAnswers,
} from '../variableOptions.ts';
import {
  DEFAULT_DATE_RESOLUTION,
  hasParameterIssues,
  parametersForShape,
  parameterShapeFor,
  parametersWith,
  PARAMETERS_BLOCK,
  readParameters,
  validateParameters,
  type ParameterShape,
} from '../variableParameters.ts';
import VariableBooleanAnswerFields from './VariableBooleanAnswerFields.tsx';
import VariableParameterFields from './VariableParameterFields.tsx';

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

const VARIABLE_EDITOR_PROPERTIES = ['name', 'type'] as const;

/**
 * What the answers surface REPLACES, which is `options` whatever it renders.
 *
 * Listed the way `parameters` is, and for the same reason: the request builder
 * lays the draft OVER the prior variable, so a key the draft no longer carries
 * would survive being taken away. Unconditional, though, where the parameters
 * block is not — "this attribute offers no list at all" is one of the answers
 * `optionsShapeFor` gives, and it is the answer for the control that cannot
 * show one. A boolean collected with a `Toggle` is the case that matters: its
 * variable schema has no `options` key, so a pair left behind by the control
 * that showed them is a variable the codebook refuses outright.
 */
const OPTIONS_OWNED_PROPERTIES = ['options'] as const;

/**
 * Properties a type change invalidates, which are therefore replaced whole
 * rather than carried over. Only rendered when something else brings them into
 * this editor's hands: `parameters` are rendered whenever the chosen control
 * takes any (see `PARAMETER_OWNED_PROPERTIES`), and validation rules belong to
 * the separate variable-validation surface.
 */
const TYPE_OWNED_PROPERTIES = [
  'component',
  'parameters',
  'validation',
  'encrypted',
] as const;

/**
 * What the parameters surface REPLACES when it is rendered.
 *
 * Only `parameters`, and only because a block can be emptied: every setting
 * cleared is an attribute that carries no `parameters` key at all, and the
 * request builder lays the draft OVER the prior variable — so a key the draft
 * no longer has would otherwise survive being deleted.
 *
 * `component` is not listed because it does not need to be: the surface
 * renders only for a control that takes settings, so the draft always names
 * one and always writes it. It is written, though — see
 * `draftOwnedByVariableEditor`. A host opens this editor on the control the
 * researcher has just chosen, which may not be the one the codebook still
 * records, and settings authored for the new control written beside the old
 * control's name are a variable the schema refuses outright (the two datetime
 * schemas are strict, and each admits only its own keys).
 */
const PARAMETER_OWNED_PROPERTIES = ['parameters'] as const;

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
  /**
   * Sends the compound edit, and may refuse it instead.
   *
   * A host that knows the draft contradicts rules already committed answers
   * `{ status: 'contradiction', message }` rather than a `failed` result: the
   * sentence is already written for the researcher, and the editor shows it
   * verbatim. See `AuxiliaryCodebookContradiction`.
   */
  onSubmitRequest(
    request: CompoundEditRequest,
  ): Promise<AuxiliaryCodebookSubmitResult> | AuxiliaryCodebookSubmitResult;
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
 * Host-neutral editor for a codebook variable's identity, type, options and
 * the settings its input control takes.
 *
 * Validation rules deliberately belong to the separate variable-validation
 * surface; any unrendered draft properties are preserved and validated by the
 * request builder rather than silently normalised here.
 *
 * Which of the optional blocks appears is decided by the attribute rather than
 * by the host: a list of values for an attribute whose answer is chosen from
 * one, the two named answers for a boolean the participant chooses between,
 * and control settings for a control that takes any. Never more than one of
 * them at a time — a categorical attribute's control takes no settings, and a
 * date or a scale is not chosen from a list.
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
    draftWithSeededResolution(
      draftWithLockedOptions(initialDraft, lockedOptions),
    ),
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
  // Which settings the chosen control takes — the whole of what decides
  // whether this editor renders and writes a `parameters` block at all.
  const parameterShape = parameterShapeFor(
    snapshot.draft.type,
    snapshot.draft.component,
  );
  // Which list of answers this attribute holds, on the same terms.
  const optionsShape = optionsShapeFor(
    snapshot.draft.type,
    snapshot.draft.component,
  );
  const replaceProperties = variableEditorReplaceProperties(
    typeChanged,
    parameterShape,
  );
  const submittedDraft =
    props.mode === 'create'
      ? draftWithOwnedBlocks(snapshot.draft, parameterShape, optionsShape)
      : draftOwnedByVariableEditor(
          snapshot.draft,
          lockedOptions !== null,
          typeChanged,
          parameterShape,
          optionsShape,
        );
  const hasOptions = optionsShape === 'choice';
  const booleanAnswers = readBooleanAnswers(snapshot.draft.options);
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

  const replaceAnswer = (index: number, answer: BooleanAnswer) => {
    replaceProperty(
      'options',
      booleanAnswers.map((held, heldIndex) =>
        heldIndex === index ? answer : held,
      ),
    );
  };

  const replaceParameter = (key: string, value: unknown) => {
    if (parameterShape === null) return;
    replaceProperty(
      'parameters',
      parametersWith(parameterShape, snapshot.draft.parameters, key, value),
    );
  };

  const handleTypeChange = (value: string | number | undefined) => {
    const nextType = variableTypeFrom(value);
    if (nextType === null) return;
    replaceDraft(draftForType(snapshot.draft, nextType));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stops at this form: a `Dialog` portals out of the DOM but stays a React
    // descendant, so React would otherwise hand this submit to the form the
    // editor was opened from — a prompt row, or the stage itself — and save
    // that instead. `preventDefault` alone only stops the browser's own
    // navigation, which is not what propagates here.
    event.stopPropagation();
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
    // Judged here for the reason the parameters are, and one of its own: the
    // schema takes any string as a label, so nothing downstream refuses an
    // answer with no words on it.
    if (optionsShape === 'boolean') {
      const answerIssues = validateBooleanAnswers(snapshot.draft.options);
      if (hasBooleanAnswerIssues(answerIssues)) {
        activeRequestId.current = null;
        setIssues(
          Object.entries(answerIssues).flatMap(([index, messages]) =>
            messages.map((message) => ({
              path: ['options', Number(index)],
              message,
            })),
          ),
        );
        return;
      }
    }
    // Judged here rather than left to the request builder: the builder parses
    // the whole variable and answers against a path, which cannot say WHICH of
    // two dates is the one the schema will not take. The same schemas run
    // either way — this one just knows which control asked.
    if (parameterShape !== null) {
      const parameterIssues = validateParameters(
        parameterShape,
        snapshot.draft.parameters,
      );
      if (hasParameterIssues(parameterIssues)) {
        activeRequestId.current = null;
        setIssues(
          Object.entries(parameterIssues).flatMap(([key, messages]) =>
            messages.map((message) => ({
              path:
                key === PARAMETERS_BLOCK ? ['parameters'] : ['parameters', key],
              message,
            })),
          ),
        );
        return;
      }
    }
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
  const answerIssues = booleanAnswerMessages(issues);
  const parameterIssues = parameterMessages(issues);
  const contradictions = contradictionMessages(issues);
  const failurePresentation = failureFrom(snapshot.lastFailure, contradictions);

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
        Define the attribute name and the kind of answer it holds.
      </Paragraph>

      {failurePresentation !== null && (
        <Alert
          ref={failureRef}
          tabIndex={-1}
          variant={failurePresentation.variant}
          className="focusable"
        >
          <AlertTitle>Attribute not saved</AlertTitle>
          <AlertDescription>
            {failurePresentation.messages.length === 1 ? (
              failurePresentation.messages[0]
            ) : (
              <ul className="list-disc pl-5">
                {failurePresentation.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
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

        {optionsShape === 'boolean' && (
          <fieldset className="mb-8 min-w-0">
            <legend className="font-heading mb-2 font-bold">
              The two answers
            </legend>
            <p className="text-muted mb-4 text-sm">
              Write what the participant chooses between. Left empty, they are
              offered Yes and No. A negative answer is shown in red when it is
              selected.
            </p>
            <VariableBooleanAnswerFields
              answers={booleanAnswers}
              onChange={replaceAnswer}
              issues={answerIssues}
              readOnly={interactionDisabled || optionsLocked}
            />
          </fieldset>
        )}

        {parameterShape !== null && (
          <fieldset
            className="mb-8 min-w-0"
            aria-invalid={
              (parameterIssues[PARAMETERS_BLOCK]?.length ?? 0) > 0 || undefined
            }
          >
            <legend className="font-heading mb-2 font-bold">
              What this control accepts
            </legend>
            <p className="text-muted mb-4 text-sm">
              These settings belong to the input control this attribute is
              collected with, so they apply wherever it is asked for.
            </p>
            {(parameterIssues[PARAMETERS_BLOCK]?.length ?? 0) > 0 && (
              <ul
                id={`${statusId}-parameter-errors`}
                className="text-destructive mb-3 list-disc pl-5"
              >
                {parameterIssues[PARAMETERS_BLOCK]?.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
            <VariableParameterFields
              shape={parameterShape}
              parameters={snapshot.draft.parameters}
              onChange={replaceParameter}
              issues={parameterIssues}
              readOnly={interactionDisabled}
            />
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
  parameterShape: ParameterShape | null,
  optionsShape: OptionsShape | null,
): CodebookVariableDraft {
  const owned: Record<string, unknown> = Object.create(null);
  const properties = includeTypeMetadata
    ? [...VARIABLE_EDITOR_PROPERTIES, ...TYPE_OWNED_PROPERTIES]
    : VARIABLE_EDITOR_PROPERTIES;
  for (const property of properties) {
    if (Object.hasOwn(draft, property)) owned[property] = draft[property];
  }
  const options = optionsForShape(optionsShape, draft.options);
  if (options === undefined) delete owned.options;
  else owned.options = options;
  // Written with them, for the reason the parameters block writes it: the pair
  // and the control that shows them cannot be committed out of step, and a
  // host opens this editor on the control the researcher has just chosen
  // rather than the one the codebook still records.
  if (optionsShape === 'boolean' && Object.hasOwn(draft, 'component')) {
    owned.component = draft.component;
  }
  if (parameterShape !== null) {
    if (Object.hasOwn(draft, 'component')) owned.component = draft.component;
    const parameters = parametersForShape(parameterShape, draft.parameters);
    if (parameters === undefined) delete owned.parameters;
    else owned.parameters = parameters;
  }
  if (persistLockedOptions) owned.readOnly = true;
  return owned;
}

/**
 * A created variable's draft, with its parameters and its answers narrowed to
 * the shapes the attribute and its chosen control actually take.
 *
 * Create mode submits the draft whole, so a block still holding what the
 * control before it needed would be sent as authored and refused by the
 * schema — the same pruning the update path gets from
 * `draftOwnedByVariableEditor`.
 */
function draftWithOwnedBlocks(
  draft: CodebookVariableDraft,
  parameterShape: ParameterShape | null,
  optionsShape: OptionsShape | null,
): CodebookVariableDraft {
  const next: Record<string, unknown> = { ...draft };
  if (parameterShape !== null) {
    const parameters = parametersForShape(parameterShape, draft.parameters);
    if (parameters === undefined) delete next.parameters;
    else next.parameters = parameters;
  }
  // A choice list is passed through as authored, so an unauthored one still
  // reaches the request builder to be refused there — see `optionsForShape`.
  if (optionsShape === 'boolean') {
    const options = optionsForShape(optionsShape, draft.options);
    if (options === undefined) delete next.options;
    else next.options = options;
  }
  return next;
}

/**
 * A date picker records the resolution its dates are stored at, even when the
 * researcher never opens the control that chooses it.
 *
 * The interview assumes a full date when the protocol declares none, so an
 * absent resolution is not an open question — it is an unstated answer, and
 * one every bound the researcher goes on to author is judged against. Seeding
 * it here means the control opens showing what the runtime will do rather than
 * showing nothing, and a save from this editor records it.
 */
function draftWithSeededResolution(
  draft: CodebookVariableDraft,
): CodebookVariableDraft {
  if (parameterShapeFor(draft.type, draft.component) !== 'datePicker') {
    return draft;
  }
  const parameters = readParameters(draft.parameters);
  if (typeof parameters.type === 'string') return draft;
  return {
    ...draft,
    parameters: { ...parameters, type: DEFAULT_DATE_RESOLUTION },
  };
}

function variableEditorReplaceProperties(
  includeTypeMetadata: boolean,
  parameterShape: ParameterShape | null,
): readonly string[] {
  return [
    ...new Set([
      ...VARIABLE_EDITOR_PROPERTIES,
      ...OPTIONS_OWNED_PROPERTIES,
      ...(includeTypeMetadata ? TYPE_OWNED_PROPERTIES : []),
      ...(parameterShape === null ? [] : PARAMETER_OWNED_PROPERTIES),
    ]),
  ];
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

  // Asked of the type with no control beside it, because the control has just
  // been deleted above — which is also why a boolean lands here holding no
  // list: the pair belongs to the control that shows it, and the type change
  // has left the new type with none.
  if (optionsShapeFor(nextType, undefined) === 'choice') {
    if (optionsShapeFor(draft.type, draft.component) !== 'choice') {
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
 * The refusals about one of a boolean's two answers, filed under the answer
 * they belong to.
 *
 * Anchored at the position rather than at the value it records, because that
 * is where the control the researcher has to fix in is: the pair is rendered
 * in the order the protocol stores it.
 */
function booleanAnswerMessages(
  issues: readonly CodebookDraftIssue[],
): BooleanAnswerIssues {
  const messages: Record<number, string[]> = {};
  for (const issue of issues) {
    if (issue.path[0] !== 'options') continue;
    const index = issue.path[1];
    if (typeof index !== 'number') continue;
    (messages[index] ??= []).push(issue.message);
  }
  return messages;
}

/**
 * The parameter refusals, filed under the control each one belongs to.
 *
 * `['parameters']` with nothing after it belongs to the block as a whole and
 * is filed under `PARAMETERS_BLOCK`, so a complaint about no one setting still
 * has somewhere to be read.
 */
function parameterMessages(
  issues: readonly CodebookDraftIssue[],
): Record<string, string[]> {
  const messages: Record<string, string[]> = {};
  for (const issue of issues) {
    if (issue.path[0] !== 'parameters') continue;
    const key = issue.path[1];
    const bucket = typeof key === 'string' ? key : PARAMETERS_BLOCK;
    (messages[bucket] ??= []).push(issue.message);
  }
  return messages;
}

/**
 * The refusals in this batch that already read as sentences for a researcher.
 *
 * `buildUpdateVariableRequest` parses the whole entity, so its issues arrive
 * anchored inside the entity document at `variables/<id>/…`, one level deeper
 * than the ones `VariableSchema` raises about the draft on screen. The ones
 * anchored at a RULE are the record-level refinements — a validation rule the
 * attribute's options can no longer satisfy, "answer at least three" with two
 * options left — and their message names the rule and the values that cannot
 * both hold, exactly as `findDraftContradictions` writes them for the
 * validation editor.
 *
 * Reported against the form rather than against a control, for two reasons:
 * validation rules belong to the separate validation surface, so this editor
 * has no control to hang them on; and the rule that can no longer hold may
 * belong to a DIFFERENT attribute than the one being edited — `<id>` is
 * whichever variable the analyser chose to anchor the strip at — in which case
 * the message names that attribute and nothing on this form is wrong.
 *
 * Everything else `validateEntityDocument` can raise is a shape complaint
 * written for whoever reads a log, and keeps the package's own copy for a save
 * that did not happen. See `compoundFailureCopy`.
 */
function contradictionMessages(
  issues: readonly CodebookDraftIssue[],
): string[] {
  return issues
    .filter(
      (issue) =>
        issue.path[0] === 'variables' && issue.path[2] === 'validation',
    )
    .map((issue) => issue.message);
}

/**
 * How a failed save is presented: what it means to the researcher, and how
 * loudly to say it.
 *
 * The words are the package's own — see `compoundFailureCopy` — never the
 * host's, with the one exception every codebook surface makes: a refusal that
 * arrives already written for a researcher, naming the rule and the values
 * that cannot both hold, is shown as it was written. It replaces the generic
 * copy rather than joining it, which would otherwise tell the researcher to
 * wait and try a save that cannot succeed until they change something.
 *
 * A section held by a collaborator is something to wait for rather than
 * something that went wrong, so it is the one failure shown as a warning.
 */
function failureFrom(
  failure: AuxiliaryCodebookDraftFailure | null,
  contradictions: readonly string[],
): Readonly<{
  variant: 'warning' | 'destructive';
  messages: readonly string[];
}> | null {
  if (contradictions.length > 0) {
    return { variant: 'destructive', messages: contradictions };
  }
  if (failure === null) return null;
  const held = failure.kind === 'result' && failure.result.status === 'blocked';
  return {
    variant: held ? 'warning' : 'destructive',
    messages: [compoundFailureMessage(failure)],
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
