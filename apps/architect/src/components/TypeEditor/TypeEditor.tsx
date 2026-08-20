import { capitalize, toPairs } from 'es-toolkit/compat';
import { useMemo } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getCodebook } from '~/selectors/protocol';
import { getFieldId } from '~/utils/issues';

import ColorPicker from '../Form/Fields/ColorPicker';
import getPalette from './getPalette';
import IconPicker from './IconPicker';
import type { ShapeMappingDraft } from './shapeMappingTypes';
import { ShapePickerControl } from './ShapePicker';
import ShapeVariableMapping, {
  type ShapeMappingVariable,
} from './ShapeVariableMapping';

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
      <Section layout="vertical">
        <ArchitectField
          label={`${capitalize(entity)} type name`}
          hint={
            <>
              This name identifies the {entity} type in the codebook and in your
              data exports.
              {entity === 'node' &&
                ' Some examples might be "Person", "Place", or "Organization".'}
              {entity === 'edge' &&
                ' Some examples might be "Friends" or "Works With".'}
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
              entity === 'node' ? 'node type name' : 'edge type name',
            uniqueByList: existingTypes,
          }}
          placeholder={`Enter a name for this ${entity} type...`}
        />
      </Section>

      <Section id={getFieldId('color')} layout="vertical">
        <ArchitectField
          component={ColorPicker}
          name="color"
          label="Color"
          hint={`Choose a color for this ${entity} type.`}
          initialValue={initialValues.color}
          validation={{ required: true }}
          palette={paletteName}
          paletteRange={paletteSize}
        />
      </Section>

      {entity === 'node' && (
        <>
          <Section id={getFieldId('shape')} layout="vertical">
            <ArchitectField
              component={ShapePickerControl}
              label="Shape"
              hint="Choose a default shape for this node type."
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
          <Section id={getFieldId('icon')} layout="vertical">
            <ArchitectField
              component={IconPicker}
              label="Icon"
              hint={`Choose an icon to display on interfaces that create this ${entity}.`}
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
