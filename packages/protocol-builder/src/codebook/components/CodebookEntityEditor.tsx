import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ColorPickerField, {
  type ColorSwatchOption,
} from '@codaco/fresco-ui/form/fields/ColorPicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelect from '@codaco/fresco-ui/form/fields/Select/Native';
import { isInterviewerIconName } from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Section from '@codaco/fresco-ui/Section';
import {
  EdgeColorSequence,
  NodeColorSequence,
} from '@codaco/protocol-validation';
import {
  normalizeForComparison,
  VariableNameSchema,
} from '@codaco/shared-consts';
import { canonicalize, type SectionDoc } from '@codaco/studio-sync/apply';

import type { CodebookSubject } from '../../protocol-context.ts';
import { codebookEditingMessages } from '../codebookMessages.ts';
import { codebookRefusalMessage } from '../compoundFailureCopy.ts';
import {
  documentForNewEntity,
  documentWithEntityProperties,
  type CodebookEntityDraft,
} from '../editing.ts';
import {
  isNodeShape,
  shapeMappingDraft,
  shapeMappingIssue,
  shapeMappingVariables,
  shapeOptions,
  type ShapeMappingDraft,
} from '../shapeMapping.ts';
import type { CodebookWriteOutcome } from '../writes.ts';
import NodeShapeMappingFields from './NodeShapeMappingFields.tsx';

const messages = defineMessages({
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
  colorOutsidePalette: {
    id: 'protocolBuilder.codebookEntity.colorOutsidePalette',
    defaultMessage: 'Current color ({color})',
    description:
      'Name of the extra swatch offered when the entity type is already stored with a colour this protocol’s palette does not contain, so the researcher can see and keep what it has. color is the stored reference.',
  },
  shapeLabel: {
    id: 'protocolBuilder.codebookEntity.shapeLabel',
    defaultMessage: 'Shape',
    description:
      'Label of the field choosing the shape a node type is drawn as when nothing overrides it.',
  },
  shapeHint: {
    id: 'protocolBuilder.codebookEntity.shapeHint',
    defaultMessage: 'Choose a default shape for this node type.',
    description:
      'Guidance under the shape field. A node is a member of the interview network.',
  },
  shapePlaceholder: {
    id: 'protocolBuilder.codebookEntity.shapePlaceholder',
    defaultMessage: 'Choose a shape…',
    description:
      'Placeholder shown in the shape field of the node type editor before a choice is made.',
  },
  iconLabel: {
    id: 'protocolBuilder.codebookEntity.iconLabel',
    defaultMessage: 'Icon',
    description:
      'Label of the field naming the icon shown on the buttons an interview offers for creating this node type.',
  },
  iconHint: {
    id: 'protocolBuilder.codebookEntity.iconHint',
    defaultMessage:
      'Enter the Lucide or Network Canvas icon name shown by interfaces that create this type.',
    description:
      'Guidance under the icon field. "Lucide" is an icon library and "Network Canvas" the product; both are names and stay as they are. An interface is one kind of interview step.',
  },
  identitySectionTitle: {
    id: 'protocolBuilder.codebookEntity.identitySectionTitle',
    defaultMessage: 'Type identity',
    description:
      'Heading of the group of the entity editor holding the name this type is known by.',
  },
  identitySectionDescription: {
    id: 'protocolBuilder.codebookEntity.identitySectionDescription',
    defaultMessage: 'Name this type for the codebook and exported data.',
    description:
      'Description of the identity group of the entity editor. The codebook is the protocol’s definition of what an interview records; exported data is the file a researcher analyses afterwards.',
  },
  colorSectionTitle: {
    id: 'protocolBuilder.codebookEntity.colorSectionTitle',
    defaultMessage: 'Type color',
    description:
      'Heading of the group of the entity editor holding the colour this type is drawn in.',
  },
  appearanceSectionTitle: {
    id: 'protocolBuilder.codebookEntity.appearanceSectionTitle',
    defaultMessage: 'Node appearance',
    description:
      'Heading of the group of the node type editor holding how a node of this type is drawn. A node is a member of the interview network.',
  },
  appearanceSectionDescription: {
    id: 'protocolBuilder.codebookEntity.appearanceSectionDescription',
    defaultMessage:
      'Choose a default shape and optionally map shapes from an attribute.',
    description:
      'Description of the appearance group of the node type editor, saying that the shape a node is drawn as can also follow one of its attributes.',
  },
  iconSectionTitle: {
    id: 'protocolBuilder.codebookEntity.iconSectionTitle',
    defaultMessage: 'Interface icon',
    description:
      'Heading of the group of the node type editor holding the icon interviews show on the buttons that create this type. An interface is one kind of interview step.',
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

/**
 * The palette, plus whatever this entity type is already stored with.
 *
 * A colour outside the sequence is offered as a swatch of its own rather than
 * dropped: the picker would otherwise show nothing selected for a type that
 * has a colour, and the first swatch the researcher touched would silently
 * replace a value they never saw.
 */
/**
 * The palette this type may be marked in, plus whatever colour it is marked in
 * now if that is not one of them.
 *
 * The swatches carry no `label`: they are the theme's own colour sequences, so
 * the picker names each one after its hue. Only the outside-the-palette
 * swatch needs a name written here, because only its value is arbitrary.
 */
const colorOptions = (
  sequence: readonly Readonly<{ value: string; index: number }>[],
  current: string,
  intl: IntlShape,
): ColorSwatchOption[] => {
  const palette = sequence.map(({ value }) => ({ value }));
  if (current === '' || palette.some(({ value }) => value === current)) {
    return palette;
  }
  return [
    ...palette,
    {
      value: current,
      label: intl.formatMessage(messages.colorOutsidePalette, {
        color: current,
      }),
    },
  ];
};

/**
 * What is wrong with each field, encoded rather than formatted.
 *
 * A refusal here stands from one submission until the next, which is longer
 * than the language it was written in is guaranteed to last: an application
 * that changes language re-renders this editor without remounting it, and a
 * sentence formatted when the researcher pressed save would sit under a field
 * whose label had moved on without it. `FieldErrors` decodes these where it
 * renders them, so they follow the formatter while they wait.
 */
type EntityFieldErrors = Readonly<
  Partial<Record<'name' | 'color' | 'shape' | 'shape.dynamic' | 'icon', string>>
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

/**
 * The draft with its shape mapping replaced, or — given nothing — removed.
 *
 * `shape` is rewritten whole rather than patched, because the entity form owns
 * it whole: an absent `dynamic` has to reach the saved document as a key that
 * is not there, which is what switching the feature off means.
 */
const replaceShapeMapping = (
  draft: CodebookEntityDraft,
  mapping: ShapeMappingDraft | undefined,
): CodebookEntityDraft => {
  const currentShape = isRecord(draft.shape) ? draft.shape : {};
  const { dynamic: _dropped, ...rest } = structuredClone(currentShape);
  return replaceDraftProperty(draft, 'shape', {
    ...rest,
    ...(mapping === undefined ? {} : { dynamic: mapping }),
  });
};

/**
 * Takes no formatter: every refusal it produces is encoded, so which words it
 * is read in is decided where it is rendered rather than where it is decided.
 */
const validateFields = (
  subject: CodebookSubject,
  draft: CodebookEntityDraft,
  existingEntityNames: readonly string[],
): EntityFieldErrors => {
  if (subject.entity === 'ego') return {};
  const errors: Partial<Record<keyof EntityFieldErrors, string>> = {};
  const name = stringValue(draft.name);
  if (name.trim() === '') {
    errors.name = createMessageError(messages.nameRequired);
  } else if (!VariableNameSchema.safeParse(name).success) {
    errors.name = createMessageError(messages.nameInvalid, {
      entity: subject.entity,
    });
  } else if (
    existingEntityNames.some(
      (existingName) =>
        normalizeForComparison(existingName) === normalizeForComparison(name),
    )
  ) {
    errors.name = createMessageError(messages.nameTaken, { name });
  }
  if (stringValue(draft.color) === '') {
    errors.color = createMessageError(messages.colorRequired);
  }
  if (subject.entity === 'node') {
    const shape = isRecord(draft.shape) ? stringValue(draft.shape.default) : '';
    if (shape === '') errors.shape = createMessageError(messages.shapeRequired);
    const mapping = isRecord(draft.shape) ? draft.shape.dynamic : undefined;
    const mappingIssue =
      mapping === undefined
        ? undefined
        : shapeMappingIssue(
            shapeMappingDraft(mapping),
            shapeMappingVariables(draft.variables),
          );
    if (mappingIssue !== undefined) errors['shape.dynamic'] = mappingIssue;
    const icon = stringValue(draft.icon);
    if (icon === '') errors.icon = createMessageError(messages.iconRequired);
    else if (!isInterviewerIconName(icon)) {
      errors.icon = createMessageError(messages.iconUnsupported);
    }
  }
  return errors;
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

  const storedShape = isRecord(draft.shape) ? draft.shape : {};
  const storedDefaultShape = storedShape.default;
  const currentDefaultShape = isNodeShape(storedDefaultShape)
    ? storedDefaultShape
    : undefined;
  const currentMapping =
    storedShape.dynamic === undefined
      ? undefined
      : shapeMappingDraft(storedShape.dynamic);

  const currentColor = stringValue(draft.color);
  const colors =
    subject.entity === 'node'
      ? colorOptions(NODE_COLOR_OPTIONS, currentColor, intl)
      : colorOptions(EDGE_COLOR_OPTIONS, currentColor, intl);

  return (
    <>
      <Section
        title={intl.formatMessage(messages.identitySectionTitle)}
        description={intl.formatMessage(messages.identitySectionDescription)}
      >
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
      </Section>

      <Section title={intl.formatMessage(messages.colorSectionTitle)}>
        <UnconnectedField
          name="color"
          label={intl.formatMessage(messages.colorLabel)}
          hint={intl.formatMessage(messages.colorHint, {
            entity: subject.entity,
          })}
          component={ColorPickerField}
          value={currentColor}
          onChange={(value) =>
            onChange(replaceDraftProperty(draft, 'color', value))
          }
          options={colors}
          required
          disabled={disabled}
          errors={errors.color === undefined ? undefined : [errors.color]}
          showErrors
        />
      </Section>

      {subject.entity === 'node' && (
        <>
          <Section
            title={intl.formatMessage(messages.appearanceSectionTitle)}
            description={intl.formatMessage(
              messages.appearanceSectionDescription,
            )}
          >
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

            <NodeShapeMappingFields
              variables={shapeMappingVariables(draft.variables)}
              {...(currentDefaultShape === undefined
                ? {}
                : { defaultShape: currentDefaultShape })}
              {...(currentMapping === undefined
                ? {}
                : { value: currentMapping })}
              onChange={(mapping) =>
                onChange(replaceShapeMapping(draft, mapping))
              }
              {...(errors['shape.dynamic'] === undefined
                ? {}
                : { error: errors['shape.dynamic'] })}
              disabled={disabled}
            />
          </Section>

          <Section title={intl.formatMessage(messages.iconSectionTitle)}>
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
          </Section>
        </>
      )}
    </>
  );
}

/**
 * The chrome of the dialog this editor is opened in, for a host that opens it
 * in one.
 *
 * Given, the editor renders the dialog itself and puts its Cancel and its save
 * in the dialog's own `footer`, where every other dialog in the package keeps
 * them — Architect's `EntityTypeDialog` did the same, through `DialogForm`.
 * That is only possible from here: the footer pins the first of its children
 * left, so the two controls have to BE the footer's children rather than
 * arrive inside something the host wrapped around them.
 *
 * Absent, the editor renders bare and keeps its controls beneath the fields,
 * which is what a page host mounting it in a column of its own wants.
 */
export type CodebookEntityEditorDialogProps = Readonly<{
  /** The dialog's own heading; also the label of the trigger that opened it. */
  title: string;
  /** Where focus returns when the dialog closes — see `Dialog.finalFocus`. */
  finalFocus?: DialogProps['finalFocus'];
}>;

type CommonEditorProps = Readonly<{
  /** Must change on every open, even when the same entity is reopened. */
  sessionKey: string;
  dialog?: CodebookEntityEditorDialogProps;
  subject: CodebookSubject;
  initialDraft: CodebookEntityDraft;
  /** Names of the other entities that this draft must not collide with. */
  existingEntityNames: readonly string[];
  /** Disables editing and submission without discarding the current draft. */
  readOnly?: boolean;
  /** Writes the section, and answers with what became of it. */
  onSubmit(document: SectionDoc): Promise<CodebookWriteOutcome>;
  onCancel?(): void;
}>;

export type CodebookEntityEditorProps = CommonEditorProps &
  (
    | Readonly<{
        mode: 'create';
        authoritativeDocument?: never;
        /** Completes navigation after a create, whose section id is new. */
        onApplied(
          outcome: Extract<CodebookWriteOutcome, { status: 'applied' }>,
        ): void;
      }>
    | Readonly<{
        mode: 'update';
        authoritativeDocument: SectionDoc;
        onApplied?(
          outcome: Extract<CodebookWriteOutcome, { status: 'applied' }>,
        ): void;
      }>
  );

/**
 * Reusable entity editor. The host owns only the write and the close or
 * navigation chrome around it.
 */
export default function CodebookEntityEditor({
  sessionKey,
  dialog,
  subject,
  initialDraft,
  existingEntityNames,
  readOnly = false,
  onSubmit,
  onCancel,
  ...modeProps
}: CodebookEntityEditorProps) {
  const intl = useAppIntl();
  // The save lives in the dialog's footer, outside the `<form>` element, so it
  // names the form it submits rather than being inside it.
  const formDomId = useId();
  const [openKey, setOpenKey] = useState(sessionKey);
  const [draft, setDraft] = useState<CodebookEntityDraft>(initialDraft);
  const [errors, setErrors] = useState<EntityFieldErrors>({});
  // A record rather than the sentence, so a second refusal saying the same
  // thing is still a new failure for the effect below to move focus to.
  const [failure, setFailure] =
    useState<Readonly<{ message: string; held: boolean }>>();
  const [busy, setBusy] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);

  // The caller's open identity owns reset semantics: the initial values may be
  // reconstructed on every render and must not reset a draft while one opening
  // is still on screen.
  if (openKey !== sessionKey) {
    setOpenKey(sessionKey);
    setDraft(initialDraft);
    setErrors({});
    setFailure(undefined);
    setBusy(false);
  }

  useEffect(() => {
    if (failure !== undefined) failureRef.current?.focus();
  }, [failure]);

  const dirty =
    modeProps.mode === 'create' ||
    canonicalize(draft) !== canonicalize(modeProps.authoritativeDocument);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stops at this form: a `Dialog` portals out of the DOM but stays a React
    // descendant, so React would otherwise hand this submit to the form the
    // editor was opened from — `SubjectSection` mounts it inside the stage
    // form — and save that instead. `preventDefault` alone only stops the
    // browser's own navigation, which is not what propagates here.
    event.stopPropagation();
    if (readOnly || busy || !dirty) return;
    const nextErrors = validateFields(subject, draft, existingEntityNames);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setFailure(undefined);

    let document: SectionDoc;
    try {
      document =
        modeProps.mode === 'create'
          ? documentForNewEntity({ subject, draft })
          : documentWithEntityProperties({
              subject,
              authoritativeDocument: modeProps.authoritativeDocument,
              draft,
            });
    } catch {
      // Everything the entity schema refuses past `validateFields` is written
      // for whoever reads a log, so the researcher gets the package's own words
      // for a save that did not happen.
      setFailure({
        message: codebookRefusalMessage({ kind: 'unexplained' }),
        held: false,
      });
      return;
    }

    setBusy(true);
    try {
      const outcome = await onSubmit(document);
      if (outcome.status === 'applied') {
        if (modeProps.mode === 'create') modeProps.onApplied(outcome);
        else modeProps.onApplied?.(outcome);
        return;
      }
      setFailure({
        message: outcome.message,
        held: outcome.refusal.kind === 'held',
      });
    } catch {
      setFailure({
        message: codebookRefusalMessage({ kind: 'unexplained' }),
        held: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const interactionDisabled = readOnly || busy;
  const canSubmit = modeProps.mode === 'create' || subject.entity !== 'ego';

  // The editor writes no heading of its own: it is opened under a title that
  // already names it — the dialog's, or the page host's — and a second one
  // saying the same thing is the restatement Architect's `TypeEditor` never
  // had. Its sections and its alert count from that title instead.
  const body = (
    <>
      {failure !== undefined && (
        <Alert
          ref={failureRef}
          // A section somebody else is holding is not a fault: the change
          // is fine and lands once they are finished, so it is said in
          // the register of a notice rather than of an error.
          variant={failure.held ? 'warning' : 'destructive'}
          appearance="soft"
          density="compact"
          tabIndex={-1}
          className="mb-6"
        >
          <AlertTitle>{intl.formatMessage(messages.failureTitle)}</AlertTitle>
          <AlertDescription>
            {/* Decoded here, not where it was raised: a refusal stands
                until the next save, so it follows a change of language
                while it waits. One already written for a researcher is
                not ours to decode and passes through. */}
            {formatMessageError(failure.message, intl) ?? failure.message}
          </AlertDescription>
        </Alert>
      )}

      <CodebookEntityFields
        subject={subject}
        draft={draft}
        onChange={setDraft}
        errors={errors}
        disabled={interactionDisabled}
      />
    </>
  );

  const actions = (
    <>
      {onCancel !== undefined && (
        <Button
          type="button"
          color="default"
          onClick={onCancel}
          disabled={busy}
        >
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
      )}
      {canSubmit && (
        <Button
          type="submit"
          form={formDomId}
          color="primary"
          disabled={interactionDisabled || !dirty}
        >
          {intl.formatMessage(
            busy ? codebookEditingMessages.saving : messages.submit,
          )}
        </Button>
      )}
    </>
  );

  const form = (tail?: ReactNode) => (
    <form
      id={formDomId}
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      {body}
      {tail}
    </form>
  );

  if (dialog !== undefined) {
    return (
      <Dialog
        open
        title={dialog.title}
        size="readable"
        // A save in flight refuses every way out, because the dialog is about
        // to show what became of it. Escape, a press outside and the close
        // button all arrive at `closeDialog`, so refusing there covers all
        // three — and `dismissible` takes the close button away rather than
        // leaving a control on screen that does nothing.
        dismissible={!busy}
        closeDialog={() => {
          if (!busy) onCancel?.();
        }}
        {...(dialog.finalFocus === undefined
          ? {}
          : { finalFocus: dialog.finalFocus })}
        footer={actions}
      >
        {form()}
      </Dialog>
    );
  }

  return (
    <Surface spacing="md" shadow="md" noContainer>
      {form(
        <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div>,
      )}
    </Surface>
  );
}
