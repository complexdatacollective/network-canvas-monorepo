import { capitalize, toPairs } from 'es-toolkit/compat';
import { useEffect, useMemo } from 'react';
import { connect } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import { Layout, Section } from '~/components/EditorLayout';
import { ValidatedField } from '~/components/Form';
import { Text } from '~/components/Form/Fields';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getCodebook } from '~/selectors/protocol';
import { getFieldId } from '~/utils/issues';

import ColorPicker from '../Form/Fields/ColorPicker';
import getPalette from './getPalette';
import IconPicker from './IconPicker';
import ShapePicker from './ShapePicker';
import ShapeVariableMapping from './ShapeVariableMapping';

type TypeEditorProps = {
  form: string;
  entity: string;
  type?: string | null;
  existingTypes: string[];
};

const TypeEditor = ({ form, entity, existingTypes }: TypeEditorProps) => {
  const dispatch = useAppDispatch();
  const formSelector = useMemo(() => formValueSelector(form), [form]);
  const formIcon = useAppSelector((state: RootState) =>
    formSelector(state, 'icon'),
  );
  const formShapeDefault = useAppSelector((state: RootState) =>
    formSelector(state, 'shape.default'),
  );
  const formColor = useAppSelector((state: RootState) =>
    formSelector(state, 'color'),
  ) as string | undefined;

  // Provide a default icon
  useEffect(() => {
    if (entity === 'node' && !formIcon) {
      dispatch(change(form, 'icon', 'add-a-person'));
    }
  }, [entity, form, formIcon, dispatch]);

  // Provide a default shape
  useEffect(() => {
    if (entity === 'node' && !formShapeDefault) {
      dispatch(change(form, 'shape.default', 'circle'));
    }
  }, [entity, form, formShapeDefault, dispatch]);

  const { name: paletteName, size: paletteSize } = getPalette(entity);

  return (
    <Layout>
      <Section
        title={`${capitalize(entity)} Type`}
        layout="vertical"
        summary={
          <p>
            Name this {entity} type. This name will be used to identify this
            type in the codebook, and in your data exports.
            {entity === 'node' &&
              ' Some examples might be "Person", "Place", or "Organization".'}
            {entity === 'edge' &&
              ' Some examples might be "Friends" or "Works With".'}
          </p>
        }
      >
        <ValidatedField
          component={Text}
          name="name"
          validation={{
            required: true,
            allowedNMToken: true,
            uniqueByList: existingTypes,
          }}
          componentProps={{
            placeholder: `Enter a name for this ${entity} type...`,
          }}
        />
      </Section>
      <Section
        title="Color"
        id={getFieldId('color')}
        summary={<p>Choose a color for this {entity} type.</p>}
        layout="vertical"
      >
        <ValidatedField
          component={ColorPicker}
          name="color"
          validation={{ required: true }}
          componentProps={{ palette: paletteName, paletteRange: paletteSize }}
        />
      </Section>
      {entity === 'node' && (
        <Section
          title="Shape"
          id={getFieldId('shape')}
          summary={<p>Choose a default shape for this node type.</p>}
          layout="vertical"
        >
          <ValidatedField
            component={ShapePicker}
            name="shape.default"
            validation={{ required: true }}
            componentProps={{ nodeColor: formColor }}
          />
          <ShapeVariableMapping form={form} nodeColor={formColor} />
        </Section>
      )}
      {entity === 'node' && (
        <Section
          title="Icon"
          id={getFieldId('icon')}
          summary={
            <p>
              Choose an icon to display on interfaces that create this {entity}.
            </p>
          }
          layout="vertical"
        >
          <ValidatedField
            component={IconPicker}
            name="icon"
            validation={{ required: true }}
          />
        </Section>
      )}
    </Layout>
  );
};

const mapStateToProps = (
  state: RootState,
  { type, isNew }: { type?: string | null; isNew?: boolean },
) => {
  const codebook = getCodebook(state);

  const getNames = (
    codebookTypeDefinitions: Record<string, { name: string }> | undefined,
    excludeType?: string | false | null,
  ): string[] => {
    if (!codebookTypeDefinitions) return [];
    const names: string[] = [];
    toPairs(codebookTypeDefinitions).forEach(([id, definition]) => {
      if (excludeType && id === excludeType) {
        return;
      }
      names.push(definition.name);
    });
    return names;
  };

  const nodes = codebook ? getNames(codebook.node, !isNew && type) : [];
  const edges = codebook ? getNames(codebook.edge, !isNew && type) : [];

  const existingTypes = nodes.concat(edges);

  return {
    existingTypes,
  };
};

export default connect(mapStateToProps)(TypeEditor);
