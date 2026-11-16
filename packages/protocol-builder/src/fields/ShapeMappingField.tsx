import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import OptionMappingField, {
  type OptionMappingRow,
} from '@codaco/fresco-ui/form/fields/OptionMappingField';
import type { NodeShapeReference } from '@codaco/protocol-validation';

import { type CustomShapes, shapeAssetIds } from '../codebook/customShapes.ts';
import NodeShapeSvgs from '../codebook/NodeShapeSvgs.tsx';
import { DOCS_BASE_URL } from '../interfaces/documentation.ts';
import {
  ShapeTile,
  type ShapeTileOption,
  shapeTileOptions,
} from './ShapePickerField.tsx';

const messages = defineMessages({
  hint: {
    id: 'protocolBuilder.shapeMapping.hint',
    defaultMessage:
      'Choose the shape a node takes for each value of this attribute. A value with no shape chosen uses the default shape. [Learn about custom shapes]({url}).',
    description:
      'Hint under the "Shape for each value" field of a node type’s shape mapping, written in markdown: keep the square brackets, the parentheses and {url} as they are, and translate only the words. A node is a member of the interview network; an attribute is a piece of data recorded about it; a custom shape is an SVG image the researcher added to draw nodes of this type.',
  },
  usesDefaultShape: {
    id: 'protocolBuilder.shapeMapping.usesDefaultShape',
    defaultMessage: 'Uses the default shape',
    description:
      'Remark beside one value of an attribute in a node type’s shape mapping, shown while no shape has been chosen for that value. Nodes with that value are drawn in the node type’s default shape.',
  },
});

type ShapeMappingAnswer<V> = Readonly<{
  value: V;
  label: OptionMappingRow['label'];
}>;

type ShapeMappingFieldProps<V> = Readonly<{
  name: string;
  label: string;
  /** One row per answer the mapped attribute can take. */
  answers: readonly ShapeMappingAnswer<V>[];
  /** The shape an answer is mapped to, or `undefined` while it has none. */
  shapeFor: (value: V) => NodeShapeReference | undefined;
  onShapeChange: (value: V, shape: NodeShapeReference) => void;
  /** The type's own colour, so a tile is drawn as the node will be. */
  nodeColor?: string;
  /** The type's own shapes, offered after the built-in ones. */
  customShapes?: CustomShapes;
  disabled?: boolean;
  readOnly?: boolean;
}>;

/**
 * The shape each answer of an attribute is drawn as: an `OptionMappingField`
 * with a node type's shapes as its options, labelled and with its hint. A row
 * with no shape chosen says that it falls back to the type's default.
 */
export default function ShapeMappingField<V>({
  name,
  label,
  answers,
  shapeFor,
  onShapeChange,
  nodeColor,
  customShapes,
  disabled,
  readOnly,
}: ShapeMappingFieldProps<V>) {
  const intl = useAppIntl();
  const shapes = answers.map((answer) => shapeFor(answer.value));

  return (
    <NodeShapeSvgs assets={shapeAssetIds(customShapes)}>
      {(shapeSvgs) => (
        <UnconnectedField
          name={name}
          label={label}
          hint={intl.formatMessage(messages.hint, {
            url: `${DOCS_BASE_URL}/design-protocols/custom-node-shapes`,
          })}
          component={OptionMappingField<ShapeTileOption>}
          rows={answers.map((answer, index) => ({
            id: String(index),
            label: answer.label,
            ...(shapes[index] === undefined
              ? { note: intl.formatMessage(messages.usesDefaultShape) }
              : {}),
          }))}
          options={shapeTileOptions(intl, customShapes, shapeSvgs)}
          renderOption={(option) => (
            <ShapeTile shape={option.shape} nodeColor={nodeColor} />
          )}
          value={shapes.flatMap((shape, index) =>
            shape === undefined ? [] : [{ id: String(index), value: shape }],
          )}
          onRowChange={(rowId, shape) => {
            const answer = answers[Number(rowId)];
            if (answer !== undefined) onShapeChange(answer.value, shape);
          }}
          disabled={disabled}
          readOnly={readOnly}
        />
      )}
    </NodeShapeSvgs>
  );
}
