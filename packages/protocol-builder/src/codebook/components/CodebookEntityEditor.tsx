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
import { Button } from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ColorPickerField, {
  type ColorSwatchOption,
} from '@codaco/fresco-ui/form/fields/ColorPicker';
import IconPicker from '@codaco/fresco-ui/form/fields/IconPicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import { isInterviewerIconName } from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Section from '@codaco/fresco-ui/Section';
import {
  type Codebook,
  dynamicValueArgumentsAt,
  type DynamicValues,
  EdgeColorSequence,
  findDynamicValueProblem,
  NodeColorSequence,
  nodeLabelValueContext,
  type NodeShapeReference,
} from '@codaco/protocol-validation';
import {
  CodebookNameSchema,
  normalizeCodebookName,
  normalizeForComparison,
} from '@codaco/shared-consts';
import { canonicalize, type SectionDoc } from '@codaco/studio-sync/apply';

import CustomShapesField, {
  customShapesGuidance,
} from '../../fields/CustomShapesField.tsx';
import type { NodeLabelDraft } from '../../fields/NodeLabelField.tsx';
import ShapePickerField from '../../fields/ShapePickerField.tsx';
import { useDiscardDraftGuard } from '../../form/discardDraftGuard.ts';
import { protocolAuthoringLinks } from '../../interfaces/documentation.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import {
  ResourceClientProvider,
  useStagedResources,
} from '../../resources/client.tsx';
import type { ResourcePromotion } from '../../state/hooks.ts';
import { codebookEditingMessages } from '../codebookMessages.ts';
import { codebookRefusalMessage } from '../compoundFailureCopy.ts';
import {
  customShapeForAsset,
  customShapesIssue,
  customShapeUsage,
  defaultShapeIssue,
  isNodeShapeReference,
  mappedShapesIssue,
  readCustomShapes,
} from '../customShapes.ts';
import {
  documentForNewEntity,
  documentWithEntityProperties,
  draftRefusalMessage,
  InvalidCodebookDraftError,
  type CodebookEntityDraft,
} from '../editing.ts';
import { useNodeLabelField } from '../nodeLabelFieldSlot.ts';
import {
  shapeMappingDraft,
  shapeMappingIssue,
  shapeMappingVariables,
  type ShapeMappingDraft,
} from '../shapeMapping.ts';
import type { CodebookWriteOutcome } from '../writes.ts';
import NodeShapeMappingFields from './NodeShapeMappingFields.tsx';

export const codebookEntityMessages = defineMessages({
  nameRequired: {
    id: 'protocolBuilder.codebookEntity.nameRequired',
    defaultMessage: 'Enter a type name.',
    description:
      'Refusal shown under the name field of the entity editor when the researcher has left it empty.',
  },
  nameInvalid: {
    id: 'protocolBuilder.codebookEntity.nameInvalid',
    defaultMessage:
      '{entity, select, node {A node type name cannot contain line breaks, tabs or other control characters.} edge {An edge type name cannot contain line breaks, tabs or other control characters.} other {An ego definition name cannot contain line breaks, tabs or other control characters.}}',
    description:
      'Refusal shown under the name field when the name holds a character that cannot be stored in a name, such as a line break or a tab. entity is node, edge or ego. Names may otherwise be written in any language or script, with spaces and punctuation.',
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
    defaultMessage: 'Choose an icon.',
    description:
      'Refusal shown under the icon field of the node type editor when the researcher has chosen no icon.',
  },
  iconUnsupported: {
    id: 'protocolBuilder.codebookEntity.iconUnsupported',
    defaultMessage: 'Choose an icon supported by Network Canvas.',
    description:
      'Refusal shown under the icon field when the icon this type already carries is not one the interview can draw. "Network Canvas" is the product name and stays as it is.',
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
      '{entity, select, node {This name identifies the node type in the codebook and exported data. Some examples might be "Person", "Place", or "Organization".} edge {This name identifies the edge type in the codebook and exported data. Some examples might be "Friends" or "Colleagues".} other {This name identifies the ego definition in the codebook and exported data.}}',
    description:
      'Guidance under the name field, saying where the name is read back and giving example type names. entity is node, edge or ego. The codebook is the protocol’s definition of what an interview records; exported data is the file a researcher analyses afterwards. The quoted examples are sample type names: translate them into natural type names in your language. Spaces, accented letters and any script are allowed in a type name.',
  },
  namePlaceholder: {
    id: 'protocolBuilder.codebookEntity.namePlaceholder',
    defaultMessage:
      '{entity, select, node {Enter a name for this node type...} other {Enter a name for this edge type...}}',
    description:
      'Placeholder in the empty name field of the entity editor. entity is node or edge; the ego has no type name.',
  },
  colorLabel: {
    id: 'protocolBuilder.codebookEntity.colorLabel',
    defaultMessage: '{entity, select, node {Node color} other {Edge color}}',
    description:
      'Label of the field choosing the colour this entity type is drawn in. entity is node or edge; the ego has no colour.',
  },
  colorHint: {
    id: 'protocolBuilder.codebookEntity.colorHint',
    defaultMessage:
      '{entity, select, node {Choose a color for this node type.} edge {Choose a color for this edge type.} other {Choose a color for this ego definition.}}',
    description:
      'Guidance under the colour field. entity is node, edge or ego.',
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
  customShapesLabel: {
    id: 'protocolBuilder.codebookEntity.customShapesLabel',
    defaultMessage: 'Custom shapes',
    description:
      'Label of the part of the node type editor where the researcher adds their own shapes for the node type from SVG image files.',
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
      'Choose the icon shown by interfaces that create this type.',
    description:
      'Guidance under the icon field, which offers the icons to choose from. An interface is one kind of interview step.',
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
      'Heading of the group of the edge type editor holding the colour this type is drawn in.',
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
  shapeImageUnavailable: {
    id: 'protocolBuilder.codebookEntity.shapeImageUnavailable',
    defaultMessage:
      'The image for the shape "{name}" is no longer available. Remove this shape and add it again.',
    description:
      'Refusal shown under the custom shapes field of the node type editor when saving fails because the SVG image one custom shape is drawn from can no longer be kept with the protocol. name is the name the researcher gave that shape.',
  },
  imageUnavailable: {
    id: 'protocolBuilder.codebookEntity.imageUnavailable',
    defaultMessage:
      'An image added to this node type is no longer available. Remove the shape that uses it, then add the shape again.',
    description:
      'Refusal shown under the custom shapes field of the node type editor when saving fails because an SVG image added for a custom shape can no longer be kept with the protocol, and the shape that uses it cannot be identified.',
  },
  dynamicLabel: {
    id: 'protocolBuilder.codebookEntity.dynamicLabel',
    defaultMessage: 'Dynamic label',
    description:
      'Heading of an optional section of the node type editor, switched on with a toggle. When it is on, the researcher writes the label shown on every node of this type, which can show the node’s attributes and change with them, in place of the label the interview would otherwise choose.',
  },
  dynamicLabelDescription: {
    id: 'protocolBuilder.codebookEntity.dynamicLabelDescription',
    defaultMessage:
      'Enable this advanced feature to define node labels yourself for this type, including the ability to define labels that change according to node attributes or network structure.',
    description:
      'Description under the Dynamic label heading in the node type editor, beside the on/off toggle that enables the section. “This type” is the node type being edited. Node attributes are the variables recorded about each node; network structure means how the node is connected to others, such as how many edges it has.',
  },
  dynamicLabelField: {
    id: 'protocolBuilder.codebookEntity.dynamicLabelField',
    defaultMessage: 'Label',
    description:
      'Label of the text field in the Dynamic label section of the node type editor, where the researcher writes the label shown on every node of this type.',
  },
  dynamicLabelHint: {
    id: 'protocolBuilder.codebookEntity.dynamicLabelHint',
    defaultMessage:
      'Define the label that nodes of this type should use. Use the syringe button to insert a dynamic attribute. Use the logic button to insert a group that conditionally renders different text. See our <docs>documentation article</docs> for more information.',
    description:
      'Hint under the Label field in the Dynamic label section of the node type editor. The syringe button is the toolbar button, drawn as a syringe, that opens the menu of values that can be inserted; a dynamic attribute is one of the node’s attributes, shown in the label as whatever value each node holds. The logic button is the toolbar button beside it; the group it inserts is a set of alternative wordings, of which the one whose rules are met is shown. The docs tag wraps the link text for the documentation article about node labels.',
  },
  dynamicLabelTextRequired: {
    id: 'protocolBuilder.codebookEntity.dynamicLabelTextRequired',
    defaultMessage: 'Write the label, or turn off Dynamic label.',
    description:
      'Validation error on the Dynamic label section of the node type editor when the section is switched on but no label text has been written. Dynamic label is the name of the section and of its on/off toggle.',
  },
  dynamicLabelProblem: {
    id: 'protocolBuilder.codebookEntity.dynamicLabelProblem',
    defaultMessage:
      'The label cannot be used as it is written. Correct the problem shown beneath it.',
    description:
      'Validation error on the Dynamic label section of the node type editor when the label text is not valid, for example because it shows a value in a place where the value could be missing. The specific problem is already shown directly beneath the label field.',
  },
  dynamicLabelRulesRequired: {
    id: 'protocolBuilder.codebookEntity.dynamicLabelRulesRequired',
    defaultMessage:
      'Every “If” in the label needs at least one rule. Open it and choose “Edit rules”, or remove it.',
    description:
      'Validation error on the Dynamic label section of the node type editor when an “If” in the label text has no rules. “Edit rules” is the name of the button on each row of an “If”.',
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

/**
 * How the label hint's markup is rendered: its link opens the documentation
 * in a new tab, so following it does not abandon the edit. Built once, at
 * module level: a tag function written inline is a component defined during
 * render, and would remount its link on every render.
 */
const dynamicLabelHintTags = {
  docs: (chunks: ReactNode) => (
    <NativeLink
      key="docs"
      href={protocolAuthoringLinks.nodeLabelling}
      target="_blank"
      rel="noopener noreferrer"
    >
      {chunks}
    </NativeLink>
  ),
};

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
      label: intl.formatMessage(codebookEntityMessages.colorOutsidePalette, {
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
  Partial<
    Record<
      | 'name'
      | 'color'
      | 'customShapes'
      | 'shape'
      | 'shape.dynamic'
      | 'icon'
      | 'dynamicLabel',
      string
    >
  >
>;

/** The default shape a type holds, where it holds one this picker knows. */
const asShapeReference = (value: unknown): NodeShapeReference | undefined =>
  isNodeShapeReference(value) ? value : undefined;

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

/** The draft property a node type's own label is kept in. */
const DYNAMIC_LABEL = 'dynamicLabel';

/**
 * What a node type's label is checked against and written with: the
 * protocol's codebook, and the type the label is for (undefined while a new
 * type is being created, which has no attributes yet).
 */
export type NodeLabelEditing = Readonly<{
  codebook: Readonly<Codebook>;
  nodeType: string | undefined;
}>;

/** What is wrong with a node type's own label, where something is. */
const dynamicLabelIssue = (
  label: Record<string, unknown>,
  { codebook, nodeType }: NodeLabelEditing,
): string | undefined => {
  const text = isRecord(label.text) ? label.text : {};
  const translations = Object.entries(text).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  if (translations.length === 0) {
    return createMessageError(codebookEntityMessages.dynamicLabelTextRequired);
  }

  const conditions = isRecord(label.conditions) ? label.conditions : {};
  for (const condition of Object.values(conditions)) {
    const rules =
      isRecord(condition) && Array.isArray(condition.rules)
        ? condition.rules
        : [];
    if (rules.length === 0) {
      return createMessageError(
        codebookEntityMessages.dynamicLabelRulesRequired,
      );
    }
  }

  // The protocol's own check, against what a label of this type can show.
  const context = nodeLabelValueContext({
    codebook,
    nodeType: nodeType ?? '',
    conditions,
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field's own bindings, written only by its editor; each is read defensively by the checker
  const bindings = (
    isRecord(label.dynamicValues) ? label.dynamicValues : {}
  ) as DynamicValues;
  const values = dynamicValueArgumentsAt(bindings, context);
  return translations.some(
    ([locale, message]) =>
      findDynamicValueProblem(message, values, locale) !== undefined,
  )
    ? createMessageError(codebookEntityMessages.dynamicLabelProblem)
    : undefined;
};

/**
 * Takes no formatter: every refusal it produces is encoded, so which words it
 * is read in is decided where it is rendered rather than where it is decided.
 */
const validateFields = (
  subject: CodebookSubject,
  draft: CodebookEntityDraft,
  existingEntityNames: readonly string[],
  nodeLabel: NodeLabelEditing | undefined,
): EntityFieldErrors => {
  if (subject.entity === 'ego') return {};
  const errors: Partial<Record<keyof EntityFieldErrors, string>> = {};
  const name = normalizeCodebookName(stringValue(draft.name));
  if (name === '') {
    errors.name = createMessageError(codebookEntityMessages.nameRequired);
  } else if (!CodebookNameSchema.safeParse(name).success) {
    errors.name = createMessageError(codebookEntityMessages.nameInvalid, {
      entity: subject.entity,
    });
  } else if (
    existingEntityNames.some(
      (existingName) =>
        normalizeForComparison(existingName) === normalizeForComparison(name),
    )
  ) {
    errors.name = createMessageError(codebookEntityMessages.nameTaken, {
      name,
    });
  }
  if (stringValue(draft.color) === '') {
    errors.color = createMessageError(codebookEntityMessages.colorRequired);
  }
  if (subject.entity === 'node') {
    const shape = isRecord(draft.shape) ? stringValue(draft.shape.default) : '';
    const customShapes = readCustomShapes(draft.customShapes);
    const shapesIssue = customShapesIssue(customShapes);
    if (shapesIssue !== undefined) errors.customShapes = shapesIssue;
    const missingDefault = defaultShapeIssue(shape, customShapes);
    if (shape === '')
      errors.shape = createMessageError(codebookEntityMessages.shapeRequired);
    else if (missingDefault !== undefined) errors.shape = missingDefault;
    const mapping = isRecord(draft.shape) ? draft.shape.dynamic : undefined;
    const mappingIssue =
      mapping === undefined
        ? undefined
        : (shapeMappingIssue(
            shapeMappingDraft(mapping),
            shapeMappingVariables(draft.variables),
          ) ?? mappedShapesIssue(shapeMappingDraft(mapping), customShapes));
    if (mappingIssue !== undefined) errors['shape.dynamic'] = mappingIssue;
    const icon = stringValue(draft.icon);
    if (icon === '')
      errors.icon = createMessageError(codebookEntityMessages.iconRequired);
    else if (!isInterviewerIconName(icon)) {
      errors.icon = createMessageError(codebookEntityMessages.iconUnsupported);
    }
    // Present only while the Dynamic label section is switched on.
    const label = draft[DYNAMIC_LABEL];
    if (nodeLabel !== undefined && isRecord(label)) {
      const labelIssue = dynamicLabelIssue(label, nodeLabel);
      if (labelIssue !== undefined) errors.dynamicLabel = labelIssue;
    }
  }
  return errors;
};

/**
 * What to say under the custom shapes field when the host would not keep an
 * image imported in this edit, naming the shape drawn from it where the host
 * said which image it stopped at.
 */
const unavailableImageIssue = (
  draft: CodebookEntityDraft,
  resourceId: string | undefined,
): string => {
  const shapes = readCustomShapes(draft.customShapes);
  const shapeId =
    resourceId === undefined
      ? undefined
      : customShapeForAsset(shapes, resourceId);
  const name = shapeId === undefined ? undefined : shapes?.[shapeId]?.name;
  return name === undefined
    ? createMessageError(codebookEntityMessages.imageUnavailable)
    : createMessageError(codebookEntityMessages.shapeImageUnavailable, {
        name,
      });
};

export type CodebookEntityFieldsProps = Readonly<{
  subject: CodebookSubject;
  draft: CodebookEntityDraft;
  onChange(draft: CodebookEntityDraft): void;
  errors?: EntityFieldErrors;
  disabled?: boolean;
  /**
   * Given, a node type is offered the Dynamic label section, where the
   * builder supplies the field it is written in (`NodeLabelFieldProvider`);
   * a host with no codebook to write a label against leaves it out.
   */
  nodeLabel?: NodeLabelEditing;
}>;

/** Controlled entity-property fields, independent of any host or store. */
export function CodebookEntityFields({
  subject,
  draft,
  onChange,
  errors = {},
  disabled = false,
  nodeLabel,
}: CodebookEntityFieldsProps) {
  const intl = useAppIntl();
  const NodeLabelField = useNodeLabelField();
  // The label as it was when its section was switched off, so that switching
  // the section back on in the same edit does not start from nothing.
  const closedLabel = useRef<unknown>(undefined);

  if (subject.entity === 'ego') {
    return (
      <Alert variant="info" appearance="soft" density="compact">
        <AlertDescription>
          {intl.formatMessage(codebookEntityMessages.egoHasNoProperties)}
        </AlertDescription>
      </Alert>
    );
  }

  const storedShape = isRecord(draft.shape) ? draft.shape : {};
  const storedDefaultShape = storedShape.default;
  const currentDefaultShape = asShapeReference(storedDefaultShape);
  const currentMapping =
    storedShape.dynamic === undefined
      ? undefined
      : shapeMappingDraft(storedShape.dynamic);
  const customShapes = readCustomShapes(draft.customShapes);

  const currentColor = stringValue(draft.color);
  const colors =
    subject.entity === 'node'
      ? colorOptions(NODE_COLOR_OPTIONS, currentColor, intl)
      : colorOptions(EDGE_COLOR_OPTIONS, currentColor, intl);

  return (
    <>
      <Section
        title={intl.formatMessage(codebookEntityMessages.identitySectionTitle)}
        description={intl.formatMessage(
          codebookEntityMessages.identitySectionDescription,
        )}
      >
        <UnconnectedField
          name="name"
          label={intl.formatMessage(codebookEntityMessages.nameLabel, {
            entity: subject.entity,
          })}
          hint={intl.formatMessage(codebookEntityMessages.nameHint, {
            entity: subject.entity,
          })}
          component={InputField}
          placeholder={intl.formatMessage(
            codebookEntityMessages.namePlaceholder,
            {
              entity: subject.entity,
            },
          )}
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

      {/* A node's colour is one part of how it is drawn, and sits with
          the rest of its appearance below. An edge has only its colour. */}
      {subject.entity === 'edge' && (
        <Section
          title={intl.formatMessage(codebookEntityMessages.colorSectionTitle)}
        >
          <UnconnectedField
            name="color"
            label={intl.formatMessage(codebookEntityMessages.colorLabel, {
              entity: subject.entity,
            })}
            hint={intl.formatMessage(codebookEntityMessages.colorHint, {
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
      )}

      {subject.entity === 'node' && (
        <>
          <Section
            title={intl.formatMessage(
              codebookEntityMessages.appearanceSectionTitle,
            )}
            description={intl.formatMessage(
              codebookEntityMessages.appearanceSectionDescription,
            )}
          >
            <UnconnectedField
              name="color"
              label={intl.formatMessage(codebookEntityMessages.colorLabel, {
                entity: subject.entity,
              })}
              hint={intl.formatMessage(codebookEntityMessages.colorHint, {
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

            <UnconnectedField
              name="customShapes"
              label={intl.formatMessage(
                codebookEntityMessages.customShapesLabel,
              )}
              hint={customShapesGuidance(intl)}
              component={CustomShapesField}
              nodeColor={currentColor}
              usage={customShapeUsage(currentDefaultShape, currentMapping)}
              value={customShapes}
              onChange={(value) =>
                onChange(replaceDraftProperty(draft, 'customShapes', value))
              }
              disabled={disabled}
              errors={
                errors.customShapes === undefined
                  ? undefined
                  : [errors.customShapes]
              }
              showErrors
            />

            <UnconnectedField
              name="shape"
              label={intl.formatMessage(codebookEntityMessages.shapeLabel)}
              hint={intl.formatMessage(codebookEntityMessages.shapeHint)}
              component={ShapePickerField}
              nodeColor={currentColor}
              customShapes={customShapes}
              value={currentDefaultShape}
              onChange={(value) =>
                onChange(replaceDefaultShape(draft, String(value)))
              }
              required
              disabled={disabled}
              errors={errors.shape === undefined ? undefined : [errors.shape]}
              showErrors
            />

            {/* Spaced from the icon below as one field is from the next. */}
            <div className="mb-8">
              <NodeShapeMappingFields
                nodeColor={currentColor}
                customShapes={customShapes}
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
            </div>

            <UnconnectedField
              name="icon"
              label={intl.formatMessage(codebookEntityMessages.iconLabel)}
              hint={intl.formatMessage(codebookEntityMessages.iconHint)}
              component={IconPicker}
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

          {nodeLabel !== undefined && NodeLabelField !== undefined && (
            <Section
              toggleable
              disabled={disabled}
              defaultOpen={draft[DYNAMIC_LABEL] !== undefined}
              onOpenChange={(open) => {
                // Switched off, the type holds no label of its own at all.
                if (!open) closedLabel.current = draft[DYNAMIC_LABEL];
                onChange(
                  replaceDraftProperty(
                    draft,
                    DYNAMIC_LABEL,
                    open ? (closedLabel.current ?? {}) : undefined,
                  ),
                );
                return true;
              }}
              title={intl.formatMessage(codebookEntityMessages.dynamicLabel)}
              description={intl.formatMessage(
                codebookEntityMessages.dynamicLabelDescription,
              )}
            >
              <UnconnectedField
                name={DYNAMIC_LABEL}
                label={intl.formatMessage(
                  codebookEntityMessages.dynamicLabelField,
                )}
                hint={intl.formatMessage(
                  codebookEntityMessages.dynamicLabelHint,
                  dynamicLabelHintTags,
                )}
                component={NodeLabelField}
                codebook={nodeLabel.codebook}
                nodeType={nodeLabel.nodeType}
                value={
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field's own value, which only it writes; it reads each part defensively
                  draft[DYNAMIC_LABEL] as NodeLabelDraft | undefined
                }
                onChange={(value) =>
                  onChange(
                    replaceDraftProperty(draft, DYNAMIC_LABEL, value ?? {}),
                  )
                }
                disabled={disabled}
                errors={
                  errors.dynamicLabel === undefined
                    ? undefined
                    : [errors.dynamicLabel]
                }
                showErrors
              />
            </Section>
          )}
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
 * them. That is only possible from here: the footer pins the first of its children
 * left, so the two controls have to BE the footer's children rather than
 * arrive inside something the host wrapped around them.
 *
 * Absent, the editor renders bare and keeps its controls beneath the fields,
 * which is what a page host mounting it in a column of its own wants.
 */
export type CodebookEntityEditorDialogProps = Readonly<{
  /** The dialog's own heading; also the label of the trigger that opened it. */
  title: string;
  /**
   * Whether the dialog is open.
   *
   * A host closes it by turning this false and keeping the editor mounted,
   * NOT by unmounting the editor: the exit animation belongs to the dialog,
   * and an editor dropped the moment it closes takes the animation with it —
   * the dialog vanishes rather than closing. `onExitComplete` says when the
   * editor may go.
   */
  open: boolean;
  /** Called once the dialog has finished animating out — see `open`. */
  onExitComplete?: () => void;
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
  /** The protocol's codebook, for a node type's own label to be written against. */
  codebook?: Readonly<Codebook>;
  /**
   * Writes the section, and answers with what became of it.
   *
   * `promote` names the files imported while the editor was open, such as a
   * custom shape's SVG, for the host to commit in the same write.
   */
  onSubmit(
    document: SectionDoc,
    promote?: ResourcePromotion,
  ): Promise<CodebookWriteOutcome>;
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
 *
 * Each opening is an edit of its own for the files imported in it: they are
 * promoted with the save, and discarded when the editor goes without one.
 * Keyed by the opening, so reopening starts a fresh draft and a fresh edit.
 */
export default function CodebookEntityEditor(props: CodebookEntityEditorProps) {
  return (
    <ResourceClientProvider key={props.sessionKey}>
      <EntityEditor {...props} />
    </ResourceClientProvider>
  );
}

function EntityEditor({
  dialog,
  subject,
  initialDraft,
  existingEntityNames,
  readOnly = false,
  codebook,
  onSubmit,
  onCancel,
  ...modeProps
}: CodebookEntityEditorProps) {
  const intl = useAppIntl();
  const nodeLabel: NodeLabelEditing | undefined =
    codebook === undefined || subject.entity !== 'node'
      ? undefined
      : {
          codebook,
          nodeType: modeProps.mode === 'update' ? subject.type : undefined,
        };
  const staged = useStagedResources();
  // The save lives in the dialog's footer, outside the `<form>` element, so it
  // names the form it submits rather than being inside it.
  const formDomId = useId();
  const [draft, setDraft] = useState<CodebookEntityDraft>(initialDraft);
  // The draft as it opened. `initialDraft` follows the live section on an
  // update, so a collaborator's change would otherwise read as unsaved work.
  const [openedDraft] = useState(() => canonicalize(initialDraft));
  const [errors, setErrors] = useState<EntityFieldErrors>({});
  // A record rather than the sentence, so a second refusal saying the same
  // thing is still a new failure for the effect below to move focus to.
  const [failure, setFailure] =
    useState<Readonly<{ message: string; held: boolean }>>();
  const [busy, setBusy] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (failure !== undefined) failureRef.current?.focus();
  }, [failure]);

  // Errors are only ever set by a refused save, so each new set is a refusal
  // whose first field the researcher is taken to.
  useEffect(() => {
    const fieldErrors = Object.fromEntries(
      Object.entries(errors).map(([field, message]) => [field, [message]]),
    );
    focusFirstError({ formErrors: [], fieldErrors }, formRef.current);
  }, [errors]);

  const requestClose = useDiscardDraftGuard({
    hasDraft: () => canonicalize(draft) !== openedDraft,
    onClose: () => onCancel?.(),
    open: dialog?.open ?? true,
    blocked: busy,
  });

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
    const nextErrors = validateFields(
      subject,
      draft,
      existingEntityNames,
      nodeLabel,
    );
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
              // Removing every custom shape leaves the draft without the key,
              // which would otherwise keep the stored shapes.
              // which would otherwise keep the stored shapes; switching
              // Dynamic label off does the same to the stored label.
              unsetProperties: ['customShapes', DYNAMIC_LABEL].filter(
                (key) => !Object.hasOwn(draft, key),
              ),
            });
    } catch (error: unknown) {
      // Everything the entity schema refuses past `validateFields` is written
      // for whoever reads a log, so the researcher gets the package's own words
      // for a save that did not happen.
      setFailure({
        message:
          error instanceof InvalidCodebookDraftError
            ? draftRefusalMessage(error)
            : codebookRefusalMessage({ kind: 'unexplained' }),
        held: false,
      });
      return;
    }

    setBusy(true);
    try {
      const outcome = await onSubmit(document, staged.promotion());
      if (outcome.status === 'applied') {
        staged.promoted();
        if (modeProps.mode === 'create') modeProps.onApplied(outcome);
        else modeProps.onApplied?.(outcome);
        return;
      }
      if (
        outcome.refusal.kind === 'promotionFailed' &&
        subject.entity === 'node'
      ) {
        // The one promotion failure the researcher fixes in a field: the
        // image behind a custom shape has gone, and removing the shape is
        // what lets the save through.
        setErrors({
          customShapes: unavailableImageIssue(
            draft,
            outcome.refusal.resourceId,
          ),
        });
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
  // would only restate it. Its sections and its alert count from that title instead.
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
          <AlertTitle>
            {intl.formatMessage(codebookEntityMessages.failureTitle)}
          </AlertTitle>
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
        {...(nodeLabel === undefined ? {} : { nodeLabel })}
      />
    </>
  );

  const actions = (
    <>
      {onCancel !== undefined && (
        <Button
          type="button"
          color="default"
          onClick={requestClose}
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
            busy
              ? codebookEditingMessages.saving
              : codebookEntityMessages.submit,
          )}
        </Button>
      )}
    </>
  );

  const form = (tail?: ReactNode) => (
    <form
      ref={formRef}
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
        open={dialog.open}
        onExitComplete={dialog.onExitComplete}
        title={dialog.title}
        size="readable"
        // A save in flight refuses every way out, because the dialog is about
        // to show what became of it. Escape, a press outside and the close
        // button all arrive at `closeDialog`, so the guard refusing there
        // covers all three — and `dismissible` takes the close button away
        // rather than leaving a control on screen that does nothing.
        dismissible={!busy}
        closeDialog={requestClose}
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
