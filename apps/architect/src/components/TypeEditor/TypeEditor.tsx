import { toPairs } from 'es-toolkit/compat';
import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getCodebook } from '~/selectors/protocol';

import ColorPicker from '../Form/Fields/ColorPicker';
import getPalette from './getPalette';
import IconPicker from './IconPicker';
import type { ShapeMappingDraft } from './shapeMappingTypes';
import { ShapePickerControl } from './ShapePicker';
import ShapeVariableMapping, {
  type ShapeMappingVariable,
} from './ShapeVariableMapping';
const messages = defineMessages({
  typeIdentity: {
    id: 'architect.typeEditor.typeEditor.typeIdentity',
    defaultMessage: 'Type identity',
    description: 'The title text in components / TypeEditor / TypeEditor.',
  },
  nameThisTypeForTheCodebook: {
    id: 'architect.typeEditor.typeEditor.nameThisTypeForTheCodebook',
    defaultMessage: 'Name this type for the codebook and exported data.',
    description:
      'The description text in components / TypeEditor / TypeEditor.',
  },
  typeName: {
    id: 'architect.typeEditor.typeEditor.typeName',
    defaultMessage: '{entity, select, node {Node} other {Edge}} type name',
    description: 'The label text in components / TypeEditor / TypeEditor.',
  },
  thisNameIdentifiesTheTypeIn: {
    id: 'architect.typeEditor.typeEditor.thisNameIdentifiesTheTypeIn',
    defaultMessage:
      '{entity, select, node {This name identifies the node type in the codebook and in your data exports. Some examples might be "Person", "Place", or "Organization".} other {This name identifies the edge type in the codebook and in your data exports. Some examples might be "Friends" or "Works With".}}',
    description: 'Visible text in components / TypeEditor / TypeEditor.',
  },
  enterANameForThisType: {
    id: 'architect.typeEditor.typeEditor.enterANameForThisType',
    defaultMessage:
      'Enter a name for this {entity, select, node {node} edge {edge} other {ego}} type...',
    description:
      'The placeholder text in components / TypeEditor / TypeEditor.',
  },
  typeColor: {
    id: 'architect.typeEditor.typeEditor.typeColor',
    defaultMessage: 'Type color',
    description: 'The title text in components / TypeEditor / TypeEditor.',
  },
  color: {
    id: 'architect.typeEditor.typeEditor.color',
    defaultMessage: 'Color',
    description: 'The label text in components / TypeEditor / TypeEditor.',
  },
  chooseAColorForThisType: {
    id: 'architect.typeEditor.typeEditor.chooseAColorForThisType',
    defaultMessage:
      'Choose a color for this {entity, select, node {node} edge {edge} other {ego}} type.',
    description: 'The hint text in components / TypeEditor / TypeEditor.',
  },
  nodeAppearance: {
    id: 'architect.typeEditor.typeEditor.nodeAppearance',
    defaultMessage: 'Node appearance',
    description: 'The title text in components / TypeEditor / TypeEditor.',
  },
  chooseADefaultShapeAndOptionally: {
    id: 'architect.typeEditor.typeEditor.chooseADefaultShapeAndOptionally',
    defaultMessage:
      'Choose a default shape and optionally map shapes from an attribute.',
    description:
      'The description text in components / TypeEditor / TypeEditor.',
  },
  shape: {
    id: 'architect.typeEditor.typeEditor.shape',
    defaultMessage: 'Shape',
    description: 'The label text in components / TypeEditor / TypeEditor.',
  },
  chooseADefaultShapeForThis: {
    id: 'architect.typeEditor.typeEditor.chooseADefaultShapeForThis',
    defaultMessage: 'Choose a default shape for this node type.',
    description: 'The hint text in components / TypeEditor / TypeEditor.',
  },
  interfaceIcon: {
    id: 'architect.typeEditor.typeEditor.interfaceIcon',
    defaultMessage: 'Interface icon',
    description: 'The title text in components / TypeEditor / TypeEditor.',
  },
  icon: {
    id: 'architect.typeEditor.typeEditor.icon',
    defaultMessage: 'Icon',
    description: 'The label text in components / TypeEditor / TypeEditor.',
  },
  chooseAnIconToDisplayOn: {
    id: 'architect.typeEditor.typeEditor.chooseAnIconToDisplayOn',
    defaultMessage:
      'Choose an icon to display on interfaces that create this {entity, select, node {node} edge {edge} other {ego}}.',
    description: 'The hint text in components / TypeEditor / TypeEditor.',
  },
});
const finalMessages = defineMessages({
  nodeName: {
    id: 'architect.final.components.TypeEditor.TypeEditor.nodeName',
    defaultMessage: 'node type name',
    description: 'Researcher-facing Architect control or feedback.',
  },
  edgeName: {
    id: 'architect.final.components.TypeEditor.TypeEditor.edgeName',
    defaultMessage: 'edge type name',
    description: 'Researcher-facing Architect control or feedback.',
  },
  nodeExamples: {
    id: 'architect.final.components.TypeEditor.TypeEditor.nodeExamples',
    defaultMessage:
      'Some examples might be "Person", "Place", or "Organization".',
    description: 'Researcher-facing Architect control or feedback.',
  },
  edgeExamples: {
    id: 'architect.final.components.TypeEditor.TypeEditor.edgeExamples',
    defaultMessage: 'Some examples might be "Friends" or "Works With".',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

const DEFAULT_NODE_ICON = 'add-a-person';
const DEFAULT_NODE_SHAPE: NodeShape = 'circle';

/** The entity-type definition as the dialog holds it before it is committed. */
export type EntityTypeValues = {
  name?: string;
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
            // Names the subject, so the message reads "Not a valid node type
            // name" rather than the mapper's default "variable name" — this
            // field is not a variable. Whole strings, one per branch, rather
            // than an interpolated `${entity} type name`.
            allowedNMToken:
              entity === 'node'
                ? intl.formatMessage(finalMessages.nodeName)
                : intl.formatMessage(finalMessages.edgeName),
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
              nodeColor={typeof nodeColor === 'string' ? nodeColor : undefined}
            />
            <ShapeVariableMapping
              variables={initialValues.variables}
              initialMapping={initialValues.shape?.dynamic}
              nodeColor={typeof nodeColor === 'string' ? nodeColor : undefined}
              defaultShape={
                typeof defaultShape === 'string'
                  ? (defaultShape as NodeShape)
                  : undefined
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
