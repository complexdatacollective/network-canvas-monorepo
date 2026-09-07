import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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
  type NodeShape,
  NodeShapes,
} from '@codaco/protocol-validation';
import {
  normalizeForComparison,
  VariableNameSchema,
} from '@codaco/shared-consts';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { CodebookSubject } from '../../protocol-context.ts';
import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import { codebookEditingMessages } from '../codebookMessages.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildCreateEntityRequest,
  buildUpdateEntityRequest,
  type AuxiliaryCodebookDraftFailure,
  type CodebookEntityDraft,
} from '../editing.ts';

/**
 * The names of the shapes a node type can be drawn as.
 *
 * One descriptor per shape rather than start-casing the schema's own token:
 * `circle` is a stored value, not copy, and upper-casing its first letter is
 * an English rule that produces an English word. The record stays exhaustive
 * over the schema union, so a shape added there fails to compile until it is
 * named here.
 */
const NODE_SHAPE_LABELS = defineMessages({
  circle: {
    id: 'protocolBuilder.codebookEntity.nodeShapeCircle',
    defaultMessage: 'Circle',
    description:
      'Choice offered for the shape a node type is drawn as in the interview. A node is a member of the interview network.',
  },
  square: {
    id: 'protocolBuilder.codebookEntity.nodeShapeSquare',
    defaultMessage: 'Square',
    description:
      'Choice offered for the shape a node type is drawn as in the interview. A node is a member of the interview network.',
  },
  diamond: {
    id: 'protocolBuilder.codebookEntity.nodeShapeDiamond',
    defaultMessage: 'Diamond',
    description:
      'Choice offered for the shape a node type is drawn as in the interview. A node is a member of the interview network.',
  },
}) satisfies Record<NodeShape, MessageDescriptor>;

const messages = defineMessages({
  nodeColorOption: {
    id: 'protocolBuilder.codebookEntity.nodeColorOption',
    defaultMessage: 'Node color {index, number}',
    description:
      'Choice offered for a node type’s colour, naming its position in the protocol’s node palette rather than the colour itself, because a protocol’s theme decides what each position looks like. index is that position, counting from one.',
  },
  edgeColorOption: {
    id: 'protocolBuilder.codebookEntity.edgeColorOption',
    defaultMessage: 'Edge color {index, number}',
    description:
      'Choice offered for an edge type’s colour, naming its position in the protocol’s edge palette rather than the colour itself, because a protocol’s theme decides what each position looks like. index is that position, counting from one.',
  },
  nameRequired: {
    id: 'protocolBuilder.codebookEntity.nameRequired',
    defaultMessage: 'Enter a type name.',
    description:
      'Refusal shown under the name field of the entity editor when the researcher has left it empty.',
  },
  nameInvalid: {
    id: 'protocolBuilder.codebookEntity.nameInvalid',
    defaultMessage:
      '{entity, select, node {Not a valid node type name. Only letters, numbers and the symbols ._-: are supported} edge {Not a valid edge type name. Only letters, numbers and the symbols ._-: are supported} other {Not a valid ego definition name. Only letters, numbers and the symbols ._-: are supported}}',
    description:
      'Refusal shown under the name field when the name holds characters the export formats cannot carry. entity is node, edge or ego. The listed symbols are literal characters and must not be translated.',
  },
  nameTaken: {
    id: 'protocolBuilder.codebookEntity.nameTaken',
    defaultMessage: 'A type named "{name}" already exists.',
    description:
      'Refusal shown under the name field when another entity type in this protocol already has that name. name is what the researcher typed.',
  },
  colorRequired: {
    id: 'protocolBuilder.codebookEntity.colorRequired',
    defaultMessage: 'Choose a color.',
    description:
      'Refusal shown under the colour field of the entity editor when the researcher has chosen none.',
  },
  shapeRequired: {
    id: 'protocolBuilder.codebookEntity.shapeRequired',
    defaultMessage: 'Choose a default shape.',
    description:
      'Refusal shown under the shape field of the node type editor when the researcher has chosen none.',
  },
  iconRequired: {
    id: 'protocolBuilder.codebookEntity.iconRequired',
    defaultMessage: 'Enter an icon name.',
    description:
      'Refusal shown under the icon field of the node type editor when the researcher has left it empty.',
  },
  iconUnsupported: {
    id: 'protocolBuilder.codebookEntity.iconUnsupported',
    defaultMessage: 'Choose an icon supported by Network Canvas.',
    description:
      'Refusal shown under the icon field when the name typed is not one of the icons the interview can draw. "Network Canvas" is the product name and stays as it is.',
  },
  egoHasNoProperties: {
    id: 'protocolBuilder.codebookEntity.egoHasNoProperties',
    defaultMessage:
      'Ego attributes are edited from the attribute list. There are no entity-level properties to configure.',
    description:
      'Shown in place of the property fields when the entity being edited is the ego — the interview participant themselves, who has attributes but no name, colour or shape of their own.',
  },
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
  createTitle: {
    id: 'protocolBuilder.codebookEntity.createTitle',
    defaultMessage:
      '{entity, select, node {Create node type} edge {Create edge type} other {Create ego definition}}',
    description:
      'Heading of the editor while a new codebook entity is being added. entity is node, edge or ego.',
  },
  editTitle: {
    id: 'protocolBuilder.codebookEntity.editTitle',
    defaultMessage:
      '{entity, select, node {Edit node type} edge {Edit edge type} other {Edit ego definition}}',
    description:
      'Heading of the editor while an existing codebook entity is being changed. entity is node, edge or ego.',
  },
  draftNotice: {
    id: 'protocolBuilder.codebookEntity.draftNotice',
    defaultMessage:
      'Changes remain in this editor until every required section can be updated together.',
    description:
      'Sentence under the editor heading explaining that nothing is saved until every part of the protocol the change touches can be written at once.',
  },
  staleAuthoritativeDescription: {
    id: 'protocolBuilder.codebookEntity.staleAuthoritativeDescription',
    defaultMessage:
      'Your draft has been kept. Close and reopen this editor to load the latest entity before saving.',
    description:
      'What to do after the protocol’s codebook changed elsewhere while this entity editor was open.',
  },
  failureTitle: {
    id: 'protocolBuilder.codebookEntity.failureTitle',
    defaultMessage: 'Could not save this entity',
    description:
      'Heading of the alert shown when the entity editor’s save was refused. The reason follows underneath.',
  },
  submit: {
    id: 'protocolBuilder.codebookEntity.submit',
    defaultMessage: 'Save entity',
    description:
      'Button that saves the codebook entity being edited. Named for the entity because the editor is commonly mounted inside another form that has a save of its own.',
  },
});

const NODE_COLOR_OPTIONS = NodeColorSequence.map((value, index) => ({
  value,
  index: index + 1,
}));

const EDGE_COLOR_OPTIONS = EdgeColorSequence.map((value, index) => ({
  value,
  index: index + 1,
}));

const colorOptions = (
  sequence: readonly Readonly<{ value: string; index: number }>[],
  label: MessageDescriptor,
  intl: IntlShape,
) =>
  sequence.map(({ value, index }) => ({
    value,
    label: intl.formatMessage(label, { index }),
  }));

const shapeOptions = (intl: IntlShape) =>
  NodeShapes.map((value) => ({
    value,
    label: intl.formatMessage(NODE_SHAPE_LABELS[value]),
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

const validateFields = (
  subject: CodebookSubject,
  draft: CodebookEntityDraft,
  existingEntityNames: readonly string[],
  intl: IntlShape,
): EntityFieldErrors => {
  if (subject.entity === 'ego') return {};
  const errors: Partial<Record<keyof EntityFieldErrors, string>> = {};
  const name = stringValue(draft.name);
  if (name.trim() === '') {
    errors.name = intl.formatMessage(messages.nameRequired);
  } else if (!VariableNameSchema.safeParse(name).success) {
    errors.name = intl.formatMessage(messages.nameInvalid, {
      entity: subject.entity,
    });
  } else if (
    existingEntityNames.some(
      (existingName) =>
        normalizeForComparison(existingName) === normalizeForComparison(name),
    )
  ) {
    errors.name = intl.formatMessage(messages.nameTaken, { name });
  }
  if (stringValue(draft.color) === '') {
    errors.color = intl.formatMessage(messages.colorRequired);
  }
  if (subject.entity === 'node') {
    const shape = isRecord(draft.shape) ? stringValue(draft.shape.default) : '';
    if (shape === '') errors.shape = intl.formatMessage(messages.shapeRequired);
    const icon = stringValue(draft.icon);
    if (icon === '') errors.icon = intl.formatMessage(messages.iconRequired);
    else if (!isInterviewerIconName(icon)) {
      errors.icon = intl.formatMessage(messages.iconUnsupported);
    }
  }
  return errors;
};

/**
 * `intl` rather than `useAppIntl()` inside, because the refusal being
 * presented reaches here as a plain string: a compound edit's `message` is
 * either this package's own encoded descriptor or a host's already-written
 * sentence, and `formatMessageError(…) ?? text` is what tells them apart.
 */
const failureMessage = (
  failure: AuxiliaryCodebookDraftFailure,
  intl: IntlShape,
): string => {
  if (failure.kind === 'error') {
    return formatMessageError(failure.message, intl) ?? failure.message;
  }
  if (failure.result.status === 'failed') {
    return (
      formatMessageError(failure.result.message, intl) ?? failure.result.message
    );
  }
  const blocker = failure.result.blockedSections[0];
  if (blocker?.holder !== undefined) {
    return intl.formatMessage(codebookEditingMessages.blockedByHolder, {
      name: blocker.holder.displayName,
    });
  }
  return intl.formatMessage(codebookEditingMessages.blockedUnknownHolder);
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
  const intl = useAppIntl();

  if (subject.entity === 'ego') {
    return (
      <Alert variant="info" appearance="soft" density="compact">
        <AlertDescription>
          {intl.formatMessage(messages.egoHasNoProperties)}
        </AlertDescription>
      </Alert>
    );
  }

  const colors =
    subject.entity === 'node'
      ? colorOptions(NODE_COLOR_OPTIONS, messages.nodeColorOption, intl)
      : colorOptions(EDGE_COLOR_OPTIONS, messages.edgeColorOption, intl);

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
        options={colors}
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
            options={shapeOptions(intl)}
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
      intl,
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

  return (
    <Surface spacing="md" shadow="md" noContainer>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex flex-col gap-6">
          <div>
            <Heading level="h2" margin="none">
              {intl.formatMessage(
                modeProps.mode === 'create'
                  ? messages.createTitle
                  : messages.editTitle,
                { entity: subject.entity },
              )}
            </Heading>
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.draftNotice)}
            </Paragraph>
          </div>

          {snapshot.authoritativeChanged && (
            <Alert variant="warning" appearance="soft" density="compact">
              <AlertTitle>
                {intl.formatMessage(
                  codebookEditingMessages.staleAuthoritativeTitle,
                )}
              </AlertTitle>
              <AlertDescription>
                {intl.formatMessage(messages.staleAuthoritativeDescription)}
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
              <AlertTitle>
                {intl.formatMessage(messages.failureTitle)}
              </AlertTitle>
              <AlertDescription>
                {failureMessage(snapshot.lastFailure, intl)}
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
                {intl.formatMessage(commonMessages.cancel)}
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
                {intl.formatMessage(
                  snapshot.status === 'submitting'
                    ? codebookEditingMessages.saving
                    : messages.submit,
                )}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Surface>
  );
}
