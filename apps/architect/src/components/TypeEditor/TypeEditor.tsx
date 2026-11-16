import { toPairs } from 'es-toolkit/compat';
import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import IconPicker from '@codaco/fresco-ui/form/fields/IconPicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import Section from '@codaco/fresco-ui/Section';
import type { LocalizedString } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getCodebook } from '~/selectors/protocol';

import ColorPicker from '../Form/Fields/ColorPicker';
import getPalette from './getPalette';
import { isNodeColorSequence, isNodeShape } from './nodeAppearance';
import type { ShapeMappingDraft } from './shapeMappingTypes';
import { ShapePickerControl } from './ShapePicker';
import ShapeVariableMapping, {
  type ShapeMappingVariable,
} from './ShapeVariableMapping';
const messages = defineMessages({
  typeIdentity: {
    id: 'architect.typeEditor.typeEditor.typeIdentity',
    defaultMessage: 'Type identity',
    description:
      "Heading of the first section of the node or edge type editor, containing the type's name.",
  },
  nameThisTypeForTheCodebook: {
    id: 'architect.typeEditor.typeEditor.nameThisTypeForTheCodebook',
    defaultMessage: 'Name this type for the codebook and exported data.',
    description:
      'Description under the Type identity section heading in the node or edge type editor.',
  },
  typeName: {
    id: 'architect.typeEditor.typeEditor.typeName',
    defaultMessage: '{entity, select, node {Node} other {Edge}} type name',
    description:
      'Label of the name field in the type editor. entity is node or edge, depending on which kind of type is being edited.',
  },
  thisNameIdentifiesTheTypeIn: {
    id: 'architect.typeEditor.typeEditor.thisNameIdentifiesTheTypeIn',
    defaultMessage:
      '{entity, select, node {This name identifies the node type in the codebook and in your data exports. Some examples might be "Person", "Place", or "Organization".} other {This name identifies the edge type in the codebook and in your data exports. Some examples might be "Friends" or "Colleagues".}}',
    description:
      'Hint below the entity type name field. The entity selector chooses a complete explanation and suggested names for a node type or an edge type; example names are interface guidance, not authored data. A type name can be any text: spaces and any script are allowed. Translate the example names naturally, as a researcher working in the target language would name a kind of person, place, organization or relationship, even if that makes them several words long.',
  },
  enterANameForThisType: {
    id: 'architect.typeEditor.typeEditor.enterANameForThisType',
    defaultMessage:
      'Enter a name for this {entity, select, node {node} edge {edge} other {ego}} type...',
    description:
      'Placeholder inside the type name field. entity is node, edge or ego, the kind of type being named.',
  },
  typeColor: {
    id: 'architect.typeEditor.typeEditor.typeColor',
    defaultMessage: 'Type color',
    description:
      "Heading of the section of the node or edge type editor where the type's colour is chosen.",
  },
  color: {
    id: 'architect.typeEditor.typeEditor.color',
    defaultMessage: 'Color',
    description:
      'Label of the colour picker field in the node or edge type editor.',
  },
  chooseAColorForThisType: {
    id: 'architect.typeEditor.typeEditor.chooseAColorForThisType',
    defaultMessage:
      'Choose a color for this {entity, select, node {node} edge {edge} other {ego}} type.',
    description:
      'Hint under the colour picker in the type editor. entity is node, edge or ego, the kind of type being edited.',
  },
  nodeAppearance: {
    id: 'architect.typeEditor.typeEditor.nodeAppearance',
    defaultMessage: 'Node appearance',
    description:
      'Heading of the section of the node type editor that sets how nodes of this type look (their shape).',
  },
  chooseADefaultShapeAndOptionally: {
    id: 'architect.typeEditor.typeEditor.chooseADefaultShapeAndOptionally',
    defaultMessage:
      'Choose a default shape and optionally map shapes from an attribute.',
    description:
      'Description under the Node appearance heading in the node type editor. Attribute means a variable recorded about each node of this type.',
  },
  shape: {
    id: 'architect.typeEditor.typeEditor.shape',
    defaultMessage: 'Shape',
    description:
      'Label of the default node shape picker in the node type editor.',
  },
  chooseADefaultShapeForThis: {
    id: 'architect.typeEditor.typeEditor.chooseADefaultShapeForThis',
    defaultMessage: 'Choose a default shape for this node type.',
    description: 'Hint under the default shape picker in the node type editor.',
  },
  interfaceIcon: {
    id: 'architect.typeEditor.typeEditor.interfaceIcon',
    defaultMessage: 'Interface icon',
    description:
      'Heading of the section of the node type editor where an icon is chosen for the interface stages that create nodes of this type.',
  },
  icon: {
    id: 'architect.typeEditor.typeEditor.icon',
    defaultMessage: 'Icon',
    description: 'Label of the icon picker field in the node type editor.',
  },
  chooseAnIconToDisplayOn: {
    id: 'architect.typeEditor.typeEditor.chooseAnIconToDisplayOn',
    defaultMessage:
      'Choose an icon to display on interfaces that create this {entity, select, node {node} edge {edge} other {ego}}.',
    description:
      'Hint under the icon picker in the node type editor. entity is node, edge or ego, the kind of type being edited. Interfaces here are interview stages that create nodes.',
  },
});
const DEFAULT_NODE_ICON = 'add-a-person';
const DEFAULT_NODE_SHAPE: NodeShape = 'circle';

/** The entity-type definition as the dialog holds it before it is committed. */
export type EntityTypeValues = {
  name?: string;
  label?: LocalizedString;
  color?: string;
  icon?: string;
  shape?: { default?: NodeShape; dynamic?: ShapeMappingDraft };
  variables?: Record<string, ShapeMappingVariable>;
};

const getTypeNames = (
  codebookTypeDefinitions: Record<string, { name: string }> | undefined,
  excludeType?: string | false | null,
): string[] => {
  if (!codebookTypeDefinitions) return [];
  const names: string[] = [];
  toPairs(codebookTypeDefinitions).forEach(([id, definition]) => {
    if (excludeType && id === excludeType) return;
    names.push(definition.name);
  });
  return names;
};

type TypeEditorProps = {
  entity: string;
  type?: string | null;
  isNew?: boolean;
  /** The committed definition, supplying each field's `initialValue`. */
  initialValues: EntityTypeValues;
};

const TypeEditor = ({
  entity,
  type,
  isNew = false,
  initialValues,
}: TypeEditorProps) => {
  const intl = useAppIntl();
  const codebook = useAppSelector((state: RootState) => getCodebook(state));
  const existingTypes = useMemo(() => {
    if (!codebook) return [];
    const excludeType = !isNew && type;
    return [
      ...getTypeNames(codebook.node, excludeType),
      ...getTypeNames(codebook.edge, excludeType),
    ];
  }, [codebook, isNew, type]);

  // The shape mapping preview follows the colour as it is picked, so this reads
  // the live field rather than the committed value.
  const nodeColor = useFormStore(
    (state) => state.getFieldState('color')?.value,
  );
  const defaultShape = useFormStore(
    (state) => state.getFieldState('shape.default')?.value,
  );

  const { name: paletteName, size: paletteSize } = getPalette(entity);

  return (
    <>
      <Section
        title={intl.formatMessage(messages.typeIdentity)}
        description={intl.formatMessage(messages.nameThisTypeForTheCodebook)}
      >
        <ArchitectField
          label={intl.formatMessage(messages.typeName, {
            entity,
          })}
          hint={
            <>
              {intl.formatMessage(messages.thisNameIdentifiesTheTypeIn, {
                entity: entity,
              })}
            </>
          }
          component={InputField}
          name="name"
          initialValue={initialValues.name}
          validation={{
            required: true,
            codebookName: true,
            uniqueByList: existingTypes,
          }}
          placeholder={intl.formatMessage(messages.enterANameForThisType, {
            entity: entity,
          })}
        />
      </Section>

      <Section title={intl.formatMessage(messages.typeColor)}>
        <ArchitectField
          component={ColorPicker}
          name="color"
          label={intl.formatMessage(messages.color)}
          hint={intl.formatMessage(messages.chooseAColorForThisType, {
            entity: entity,
          })}
          initialValue={initialValues.color}
          validation={{ required: true }}
          palette={paletteName}
          paletteRange={paletteSize}
        />
      </Section>

      {entity === 'node' && (
        <>
          <Section
            title={intl.formatMessage(messages.nodeAppearance)}
            description={intl.formatMessage(
              messages.chooseADefaultShapeAndOptionally,
            )}
          >
            <ArchitectField
              component={ShapePickerControl}
              label={intl.formatMessage(messages.shape)}
              hint={intl.formatMessage(messages.chooseADefaultShapeForThis)}
              name="shape.default"
              initialValue={initialValues.shape?.default ?? DEFAULT_NODE_SHAPE}
              validation={{ required: true }}
              nodeColor={isNodeColorSequence(nodeColor) ? nodeColor : undefined}
            />
            <ShapeVariableMapping
              variables={initialValues.variables}
              initialMapping={initialValues.shape?.dynamic}
              nodeColor={isNodeColorSequence(nodeColor) ? nodeColor : undefined}
              defaultShape={
                isNodeShape(defaultShape) ? defaultShape : undefined
              }
            />
          </Section>
          <Section title={intl.formatMessage(messages.interfaceIcon)}>
            <ArchitectField
              component={IconPicker}
              label={intl.formatMessage(messages.icon)}
              hint={intl.formatMessage(messages.chooseAnIconToDisplayOn, {
                entity: entity,
              })}
              name="icon"
              initialValue={initialValues.icon ?? DEFAULT_NODE_ICON}
              validation={{ required: true }}
            />
          </Section>
        </>
      )}
    </>
  );
};

export default TypeEditor;
