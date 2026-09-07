import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelect from '@codaco/fresco-ui/form/fields/Select/Native';
import { isInterviewerIconName } from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  EnclosingHeadingLevel,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
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

import { allowedNameMessage } from '../../form/arrayFields/rowValidators.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import { compoundFailureMessage } from '../compoundFailureCopy.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildCreateEntityRequest,
  buildUpdateEntityRequest,
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
    errors.name = allowedNameMessage(`${entityLabel(subject)} name`);
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

/**
 * The entity editor's own field chrome.
 *
 * Filed under `codebookEntity` beside `CodebookSurface`'s, which is the same
 * area: the surface names the card, this names what is inside it, and a
 * translator reads both under one heading. The entity kind is a `select`
 * argument rather than a phrase spliced into a template — "node type" is a
 * noun phrase whose position and agreement differ by language, and a sentence
 * built by concatenation gives a translator nowhere to move it.
 */
const messages = defineMessages({
  nameLabel: {
    id: 'protocolBuilder.codebookEntity.nameLabel',
    defaultMessage:
      '{entity, select, node {Node type name} other {Edge type name}}',
    description:
      'Label of the field holding the researcher’s own name for this entity type. entity is node or edge; the ego has no type name.',
  },
  nameHint: {
    id: 'protocolBuilder.codebookEntity.nameHint',
    defaultMessage:
      '{entity, select, node {This name identifies the node type in the codebook and exported data.} edge {This name identifies the edge type in the codebook and exported data.} other {This name identifies the ego definition in the codebook and exported data.}}',
    description:
      'Guidance under the name field, saying where the name is read back. entity is node, edge or ego. The codebook is the protocol’s definition of what an interview records; exported data is the file a researcher analyses afterwards.',
  },
  colorLabel: {
    id: 'protocolBuilder.codebookEntity.colorLabel',
    defaultMessage: 'Protocol color',
    description:
      'Label of the field choosing which position in the protocol’s palette this entity type is drawn in.',
  },
  colorHint: {
    id: 'protocolBuilder.codebookEntity.colorHint',
    defaultMessage:
      '{entity, select, node {Choose a color reference for this node type.} edge {Choose a color reference for this edge type.} other {Choose a color reference for this ego definition.}}',
    description:
      'Guidance under the colour field. entity is node, edge or ego. A colour reference is a position in the protocol’s palette rather than a literal colour.',
  },
  colorPlaceholder: {
    id: 'protocolBuilder.codebookEntity.colorPlaceholder',
    defaultMessage: 'Choose a color…',
    description:
      'Placeholder shown in the colour field of the entity editor before a choice is made.',
  },
  shapeLabel: {
    id: 'protocolBuilder.codebookEntity.shapeLabel',
    defaultMessage: 'Default shape',
    description:
      'Label of the field choosing the shape a node type is drawn as when nothing overrides it.',
  },
  shapeHint: {
    id: 'protocolBuilder.codebookEntity.shapeHint',
    defaultMessage:
      'Choose the shape used when no dynamic shape mapping applies.',
    description:
      'Guidance under the shape field. A dynamic shape mapping is a protocol rule that draws a node differently depending on one of its attributes.',
  },
  shapePlaceholder: {
    id: 'protocolBuilder.codebookEntity.shapePlaceholder',
    defaultMessage: 'Choose a shape…',
    description:
      'Placeholder shown in the shape field of the node type editor before a choice is made.',
  },
  iconLabel: {
    id: 'protocolBuilder.codebookEntity.iconLabel',
    defaultMessage: 'Interface icon',
    description:
      'Label of the field naming the icon shown on the buttons an interview offers for creating this node type. An interface is one kind of interview step.',
  },
  iconHint: {
    id: 'protocolBuilder.codebookEntity.iconHint',
    defaultMessage:
      'Enter the Lucide or Network Canvas icon name shown by interfaces that create this type.',
    description:
      'Guidance under the icon field. "Lucide" is an icon library and "Network Canvas" the product; both are names and stay as they are. An interface is one kind of interview step.',
  },
});

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
  const intl = useAppIntl();
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

  const colorOptions =
    subject.entity === 'node' ? NODE_COLOR_OPTIONS : EDGE_COLOR_OPTIONS;

  return (
    <div className="flex flex-col gap-6">
      <UnconnectedField
        name="name"
        label={intl.formatMessage(messages.nameLabel, {
          entity: subject.entity,
        })}
        hint={intl.formatMessage(messages.nameHint, {
          entity: subject.entity,
        })}
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
        label={intl.formatMessage(messages.colorLabel)}
        hint={intl.formatMessage(messages.colorHint, {
          entity: subject.entity,
        })}
        component={NativeSelect}
        value={stringValue(draft.color)}
        onChange={(value) =>
          onChange(replaceDraftProperty(draft, 'color', value))
        }
        options={colorOptions}
        placeholder={intl.formatMessage(messages.colorPlaceholder)}
        required
        disabled={disabled}
        errors={errors.color === undefined ? undefined : [errors.color]}
        showErrors
      />

      {subject.entity === 'node' && (
        <>
          <UnconnectedField
            name="shape"
            label={intl.formatMessage(messages.shapeLabel)}
            hint={intl.formatMessage(messages.shapeHint)}
            component={NativeSelect}
            value={
              isRecord(draft.shape) ? stringValue(draft.shape.default) : ''
            }
            onChange={(value) =>
              onChange(replaceDefaultShape(draft, String(value)))
            }
            options={NODE_SHAPE_OPTIONS}
            placeholder={intl.formatMessage(messages.shapePlaceholder)}
            required
            disabled={disabled}
            errors={errors.shape === undefined ? undefined : [errors.shape]}
            showErrors
          />

          <UnconnectedField
            name="icon"
            label={intl.formatMessage(messages.iconLabel)}
            hint={intl.formatMessage(messages.iconHint)}
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
  /** Names of the other entities that this draft must not collide with. */
  existingEntityNames: readonly string[];
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
  existingEntityNames,
  readOnly = false,
  onSubmit,
  onCancel,
  ...modeProps
}: CodebookEntityEditorProps) {
  const intl = useAppIntl();
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
      if (session.receiveAuthoritative(authoritativeDocument)) {
        activeRequestId.current = null;
      }
    }
  }, [authoritativeDocument, session]);

  useEffect(() => {
    if (snapshot.lastFailure !== null) failureRef.current?.focus();
  }, [snapshot.lastFailure]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stops at this form: a `Dialog` portals out of the DOM but stays a React
    // descendant, so React would otherwise hand this submit to the form the
    // editor was opened from — `SubjectSection` mounts it inside the stage
    // form — and save that instead. `preventDefault` alone only stops the
    // browser's own navigation, which is not what propagates here.
    event.stopPropagation();
    if (
      readOnly ||
      snapshot.status !== 'editing' ||
      snapshot.authoritativeChanged ||
      (modeProps.mode === 'update' && !session.isDirty())
    ) {
      return;
    }
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
      if (
        result.status === 'applied' &&
        !session.getSnapshot().authoritativeChanged
      ) {
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
  // Every host opens this editor inside a dialog, whose own title is the
  // heading above it — so writing an `h2` here put the editor's title beside
  // the dialog's rather than under it, and the alerts below counted from the
  // dialog too and landed beside this title in turn. Read instead of written
  // out, so the same editor is also correct on a page of its own, where an
  // `h2` is what it has always been.
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h2'
      : headingTagBelow(enclosingHeadingLevel);

  return (
    <Surface spacing="md" shadow="md" noContainer>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex flex-col gap-6">
          <div>
            <Heading
              level="h2"
              margin="none"
              // The element only — `level` still carries the type treatment.
              {...(headingTag === 'h2'
                ? {}
                : { render: createElement(headingTag) })}
            >
              {modeProps.mode === 'create' ? 'Create' : 'Edit'}{' '}
              {entityLabel(subject)}
            </Heading>
            <Paragraph emphasis="muted" margin="none">
              Changes remain in this editor until every required section can be
              updated together.
            </Paragraph>
          </div>

          <EnclosingHeadingLevel level={headingTag}>
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
                  {compoundFailureMessage(snapshot.lastFailure, intl)}
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
          </EnclosingHeadingLevel>
        </div>
      </form>
    </Surface>
  );
}
