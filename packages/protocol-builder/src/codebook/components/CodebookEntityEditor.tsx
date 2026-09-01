import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelect from '@codaco/fresco-ui/form/fields/Select/Native';
import { isInterviewerIconName } from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  EdgeColorSequence,
  NodeColorSequence,
  NodeShapes,
} from '@codaco/protocol-validation';
import {
  normalizeForComparison,
  VariableNameSchema,
} from '@codaco/shared-consts';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { CodebookSubject } from '../../protocol-context.ts';
import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildCreateEntityRequest,
  buildUpdateEntityRequest,
  type AuxiliaryCodebookDraftFailure,
  type CodebookEntityDraft,
} from '../editing.ts';

const NODE_COLOR_OPTIONS = NodeColorSequence.map((value, index) => ({
  value,
  label: `Node color ${index + 1}`,
}));

const EDGE_COLOR_OPTIONS = EdgeColorSequence.map((value, index) => ({
  value,
  label: `Edge color ${index + 1}`,
}));

const NODE_SHAPE_OPTIONS = NodeShapes.map((value) => ({
  value,
  label: value[0]?.toUpperCase() + value.slice(1),
}));

type EntityFieldErrors = Readonly<
  Partial<Record<'name' | 'color' | 'shape' | 'icon', string>>
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const replaceDraftProperty = (
  draft: CodebookEntityDraft,
  key: string,
  value: unknown,
): CodebookEntityDraft => {
  const next: SectionDoc = structuredClone(draft);
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
};

const replaceDefaultShape = (
  draft: CodebookEntityDraft,
  value: string,
): CodebookEntityDraft => {
  const currentShape = isRecord(draft.shape) ? draft.shape : {};
  return replaceDraftProperty(draft, 'shape', {
    ...structuredClone(currentShape),
    default: value,
  });
};

const entityLabel = (subject: CodebookSubject): string => {
  if (subject.entity === 'node') return 'node type';
  if (subject.entity === 'edge') return 'edge type';
  return 'ego definition';
};

const validateFields = (
  subject: CodebookSubject,
  draft: CodebookEntityDraft,
  existingEntityNames: readonly string[],
): EntityFieldErrors => {
  if (subject.entity === 'ego') return {};
  const errors: Partial<Record<keyof EntityFieldErrors, string>> = {};
  const name = stringValue(draft.name);
  if (name.trim() === '') errors.name = 'Enter a type name.';
  else if (!VariableNameSchema.safeParse(name).success) {
    errors.name = `Not a valid ${entityLabel(subject)} name. Only letters, numbers and the symbols ._-: are supported`;
  } else if (
    existingEntityNames.some(
      (existingName) =>
        normalizeForComparison(existingName) === normalizeForComparison(name),
    )
  ) {
    errors.name = `A type named "${name}" already exists.`;
  }
  if (stringValue(draft.color) === '') errors.color = 'Choose a color.';
  if (subject.entity === 'node') {
    const shape = isRecord(draft.shape) ? stringValue(draft.shape.default) : '';
    if (shape === '') errors.shape = 'Choose a default shape.';
    const icon = stringValue(draft.icon);
    if (icon === '') errors.icon = 'Enter an icon name.';
    else if (!isInterviewerIconName(icon)) {
      errors.icon = 'Choose an icon supported by Network Canvas.';
    }
  }
  return errors;
};

const failureMessage = (failure: AuxiliaryCodebookDraftFailure): string => {
  if (failure.kind === 'error') return failure.message;
  if (failure.result.status === 'failed') return failure.result.message;
  const blocker = failure.result.blockedSections[0];
  if (blocker?.holder !== undefined) {
    return `${blocker.holder.displayName} is currently editing a section needed for this change.`;
  }
  return 'A section needed for this change is currently being edited.';
};

export type CodebookEntityFieldsProps = Readonly<{
  subject: CodebookSubject;
  draft: CodebookEntityDraft;
  onChange(draft: CodebookEntityDraft): void;
  errors?: EntityFieldErrors;
  disabled?: boolean;
}>;

/** Controlled entity-property fields, independent of any host or store. */
export function CodebookEntityFields({
  subject,
  draft,
  onChange,
  errors = {},
  disabled = false,
}: CodebookEntityFieldsProps) {
  if (subject.entity === 'ego') {
    return (
      <Alert variant="info" appearance="soft" density="compact">
        <AlertDescription>
          Ego attributes are edited from the attribute list. There are no
          entity-level properties to configure.
        </AlertDescription>
      </Alert>
    );
  }

  const subjectLabel = subject.entity === 'node' ? 'Node' : 'Edge';
  const colorOptions =
    subject.entity === 'node' ? NODE_COLOR_OPTIONS : EDGE_COLOR_OPTIONS;

  return (
    <div className="flex flex-col gap-6">
      <UnconnectedField
        name="name"
        label={`${subjectLabel} type name`}
        hint={`This name identifies the ${entityLabel(subject)} in the codebook and exported data.`}
        component={InputField}
        value={stringValue(draft.name)}
        onChange={(value) =>
          onChange(replaceDraftProperty(draft, 'name', value ?? ''))
        }
        required
        disabled={disabled}
        errors={errors.name === undefined ? undefined : [errors.name]}
        showErrors
      />

      <UnconnectedField
        name="color"
        label="Protocol color"
        hint={`Choose a color reference for this ${entityLabel(subject)}.`}
        component={NativeSelect}
        value={stringValue(draft.color)}
        onChange={(value) =>
          onChange(replaceDraftProperty(draft, 'color', value))
        }
        options={colorOptions}
        placeholder="Choose a color…"
        required
        disabled={disabled}
        errors={errors.color === undefined ? undefined : [errors.color]}
        showErrors
      />

      {subject.entity === 'node' && (
        <>
          <UnconnectedField
            name="shape"
            label="Default shape"
            hint="Choose the shape used when no dynamic shape mapping applies."
            component={NativeSelect}
            value={
              isRecord(draft.shape) ? stringValue(draft.shape.default) : ''
            }
            onChange={(value) =>
              onChange(replaceDefaultShape(draft, String(value)))
            }
            options={NODE_SHAPE_OPTIONS}
            placeholder="Choose a shape…"
            required
            disabled={disabled}
            errors={errors.shape === undefined ? undefined : [errors.shape]}
            showErrors
          />

          <UnconnectedField
            name="icon"
            label="Interface icon"
            hint="Enter the Lucide or Network Canvas icon name shown by interfaces that create this type."
            component={InputField}
            value={stringValue(draft.icon)}
            onChange={(value) =>
              onChange(replaceDraftProperty(draft, 'icon', value ?? ''))
            }
            required
            disabled={disabled}
            errors={errors.icon === undefined ? undefined : [errors.icon]}
            showErrors
          />
        </>
      )}
    </div>
  );
}

type CommonEditorProps = Readonly<{
  /** Must change on every open, even when the same entity is reopened. */
  sessionKey: string;
  /** Creates a new intent id after the draft changes; unchanged retries reuse it. */
  createRequestId(): string;
  description: string;
  subject: CodebookSubject;
  initialDraft: CodebookEntityDraft;
  existingEntityNames?: readonly string[];
  /** Disables editing and submission without discarding the current draft. */
  readOnly?: boolean;
  onSubmit(
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult> | CompoundEditResult;
  onCancel?(): void;
}>;

export type CodebookEntityEditorProps = CommonEditorProps &
  (
    | Readonly<{
        mode: 'create';
        authoritativeDocument?: never;
        /** Completes navigation after a create, which has no document to reconcile. */
        onApplied(
          result: Extract<CompoundEditResult, { status: 'applied' }>,
        ): void;
      }>
    | Readonly<{
        mode: 'update';
        authoritativeDocument: SectionDoc;
        onApplied?(
          result: Extract<CompoundEditResult, { status: 'applied' }>,
        ): void;
      }>
  );

/**
 * Reusable entity editor with its own auxiliary draft lifecycle. The host owns
 * only request execution and close/navigation chrome.
 */
export default function CodebookEntityEditor({
  sessionKey,
  createRequestId,
  description,
  subject,
  initialDraft,
  existingEntityNames = [],
  readOnly = false,
  onSubmit,
  onCancel,
  ...modeProps
}: CodebookEntityEditorProps) {
  const session = useMemo(
    () =>
      new AuxiliaryCodebookDraftSession(
        initialDraft,
        modeProps.mode === 'update' ? modeProps.authoritativeDocument : null,
      ),
    // A caller-supplied open identity deliberately owns reset semantics. The
    // initial values may be reconstructed on every render and must not reset a
    // draft while one editing session remains open.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [sessionKey],
  );
  const subscribe = useCallback(
    (listener: () => void) => session.subscribe(listener),
    [session],
  );
  const getSnapshot = useCallback(() => session.getSnapshot(), [session]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [errors, setErrors] = useState<EntityFieldErrors>({});
  const failureRef = useRef<HTMLDivElement>(null);
  const activeRequestId = useRef<string | null>(null);
  const authoritativeDocument =
    modeProps.mode === 'update' ? modeProps.authoritativeDocument : null;

  useEffect(() => {
    setErrors({});
    activeRequestId.current = null;
  }, [sessionKey]);

  useEffect(() => {
    if (authoritativeDocument !== null) {
      activeRequestId.current = null;
      session.receiveAuthoritative(authoritativeDocument);
    }
  }, [authoritativeDocument, session]);

  useEffect(() => {
    if (snapshot.lastFailure !== null) failureRef.current?.focus();
  }, [snapshot.lastFailure]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly || snapshot.status !== 'editing') return;
    const nextErrors = validateFields(
      subject,
      snapshot.draft,
      existingEntityNames,
    );
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const requestId = activeRequestId.current ?? createRequestId();
    activeRequestId.current = requestId;

    try {
      const result = await session.submit(
        (draft, latestAuthoritativeDocument) =>
          modeProps.mode === 'create'
            ? buildCreateEntityRequest({
                requestId,
                description,
                subject,
                draft,
              })
            : buildUpdateEntityRequest({
                requestId,
                description,
                subject,
                authoritativeDocument:
                  latestAuthoritativeDocument ??
                  modeProps.authoritativeDocument,
                draft,
              }),
        onSubmit,
      );
      // A refreshed authority or content base changes the host fingerprint.
      // Other failures keep the id stable so uncertain retries remain safe.
      if (
        result.status === 'failed' &&
        (result.reason === 'stale-epoch' ||
          result.reason === 'lease-lost' ||
          result.reason === 'stale-base')
      ) {
        activeRequestId.current = null;
      }
      if (result.status === 'applied') {
        if (modeProps.mode === 'create') modeProps.onApplied(result);
        else modeProps.onApplied?.(result);
      }
    } catch {
      // AuxiliaryCodebookDraftSession owns the visible failure and preserves
      // the draft. The submit handler must not close or reset the editor.
    }
  };

  const busy = snapshot.status !== 'editing';
  const interactionDisabled = readOnly || busy;
  const canSubmit = modeProps.mode === 'create' || subject.entity !== 'ego';

  return (
    <Surface spacing="md" shadow="md" noContainer>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex flex-col gap-6">
          <div>
            <Heading level="h2" margin="none">
              {modeProps.mode === 'create' ? 'Create' : 'Edit'}{' '}
              {entityLabel(subject)}
            </Heading>
            <Paragraph emphasis="muted" margin="none">
              Changes remain in this editor until every required section can be
              updated together.
            </Paragraph>
          </div>

          {snapshot.authoritativeChanged && (
            <Alert variant="warning" appearance="soft" density="compact">
              <AlertTitle>Newer codebook data is available</AlertTitle>
              <AlertDescription>
                Your draft has been kept. Close and reopen this editor to load
                the latest entity before saving.
              </AlertDescription>
            </Alert>
          )}

          {snapshot.lastFailure !== null && (
            <Alert
              ref={failureRef}
              variant="destructive"
              appearance="soft"
              density="compact"
              tabIndex={-1}
            >
              <AlertTitle>Could not save this entity</AlertTitle>
              <AlertDescription>
                {failureMessage(snapshot.lastFailure)}
              </AlertDescription>
            </Alert>
          )}

          <CodebookEntityFields
            subject={subject}
            draft={snapshot.draft}
            onChange={(draft) => {
              activeRequestId.current = null;
              session.replaceDraft(draft);
            }}
            errors={errors}
            disabled={interactionDisabled}
          />

          <div className="flex flex-wrap justify-end gap-3">
            {onCancel !== undefined && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
            )}
            {canSubmit && (
              <Button
                type="submit"
                color="primary"
                disabled={
                  interactionDisabled ||
                  snapshot.authoritativeChanged ||
                  (modeProps.mode === 'update' && !session.isDirty())
                }
              >
                {snapshot.status === 'submitting' ? 'Saving…' : 'Save entity'}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Surface>
  );
}
