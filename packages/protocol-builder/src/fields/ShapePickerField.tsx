import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import OptionMappingField, {
  type OptionMappingOption,
} from '@codaco/fresco-ui/form/fields/OptionMappingField';
import Node, {
  isNodeColorSequence,
  type NodeShapeProp,
} from '@codaco/fresco-ui/Node';
import {
  type NodeShapeReference,
  resolveNodeShapeReference,
} from '@codaco/protocol-validation';

import {
  customShapeReference,
  type CustomShapes,
  shapeAssetIds,
} from '../codebook/customShapes.ts';
import NodeShapeSvgs from '../codebook/NodeShapeSvgs.tsx';
import { shapeOptions } from '../codebook/shapeMapping.ts';

const messages = defineMessages({
  unnamedShape: {
    id: 'protocolBuilder.shapePicker.unnamedShape',
    defaultMessage: 'Custom shape {position, number}',
    description:
      'Name used for a custom node shape the researcher has not named yet, in the node-shape picker. position counts the custom shapes from 1. A custom shape is an SVG image the researcher added to draw nodes of this type.',
  },
});

export type ShapeTileOption = OptionMappingOption &
  Readonly<{ value: NodeShapeReference; shape: NodeShapeProp }>;

/**
 * The shapes a node type offers: the built-in ones, then the type's own, drawn
 * from `shapeSvgs` (see `NodeShapeSvgs`).
 */
export const shapeTileOptions = (
  intl: IntlShape,
  customShapes: CustomShapes | undefined,
  shapeSvgs: Readonly<Record<string, string>>,
): ShapeTileOption[] =>
  [
    ...shapeOptions(intl).map((option) => ({ ...option, shape: option.value })),
    ...Object.entries(customShapes ?? {}).map(([shapeId, custom], index) => {
      const value = customShapeReference(shapeId);
      return {
        value,
        label:
          custom.name.trim() ||
          intl.formatMessage(messages.unnamedShape, { position: index + 1 }),
        shape: resolveNodeShapeReference(value, customShapes, shapeSvgs),
      };
    }),
  ].map((option) => ({
    ...option,
    ariaLabel: `Select shape ${option.label}`,
  }));

/**
 * One shape as a tile shows it: drawn as a node of the type will be, in the
 * type's own colour. The label is left empty: a tile is too small to read one,
 * though a shape's label plate is still drawn.
 */
export function ShapeTile({
  shape,
  nodeColor = 'node-color-seq-1',
}: Readonly<{ shape: NodeShapeProp; nodeColor?: string }>) {
  return (
    <Node
      presentational
      shape={shape}
      label=""
      color={isNodeColorSequence(nodeColor) ? nodeColor : 'node-color-seq-1'}
      size="xxs"
      className="size-11"
    />
  );
}

const ROW_ID = 'shape';

export type ShapePickerFieldProps = CreateFormFieldProps<
  NodeShapeReference,
  'fieldset',
  {
    /** Tiles alone, for a row that is already a control surface. */
    small?: boolean;
    /** The type's own colour, so a tile is drawn as the node will be. */
    nodeColor?: string;
    /** The type's own shapes, offered after the built-in ones. */
    customShapes?: CustomShapes;
    required?: boolean;
  }
>;

/**
 * Which shape a node type is drawn as, chosen from the shapes themselves.
 *
 * The single-row form of the shape mapping: the same tiles, tinted with the
 * type's live colour, so the researcher chooses by looking at what the
 * participant will see. Labelling belongs to the surrounding field.
 */
export default function ShapePickerField({
  value,
  onChange,
  small = false,
  nodeColor,
  customShapes,
  required: _required,
  ...rest
}: ShapePickerFieldProps) {
  const intl = useAppIntl();

  return (
    <NodeShapeSvgs assets={shapeAssetIds(customShapes)}>
      {(shapeSvgs) => (
        <OptionMappingField
          {...rest}
          rows={[{ id: ROW_ID, label: '' }]}
          rowLabelsHidden
          bare={small}
          showOptionLabels={!small}
          options={shapeTileOptions(intl, customShapes, shapeSvgs)}
          renderOption={(option) => (
            <ShapeTile shape={option.shape} nodeColor={nodeColor} />
          )}
          value={value === undefined ? [] : [{ id: ROW_ID, value }]}
          onRowChange={(_row, shape) => onChange?.(shape)}
        />
      )}
    </NodeShapeSvgs>
  );
}
