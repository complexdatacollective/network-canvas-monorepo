import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import OptionMappingField, {
  type OptionMappingRow,
  type OptionMappingValue,
} from '@codaco/fresco-ui/form/fields/OptionMappingField';

import type { CustomShapes } from '../codebook/customShapes.ts';
import { DOCS_BASE_URL } from '../interfaces/documentation.ts';
import { ShapeTile, shapeTileOptions } from './ShapePickerField.tsx';

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

/** The hint every shape mapping field carries, with its link to the documentation. */
export const useShapeMappingHint = (): string =>
  useAppIntl().formatMessage(messages.hint, {
    url: `${DOCS_BASE_URL}/design-protocols/custom-node-shapes`,
  });

type ShapeMappingFieldProps = CreateFormFieldProps<
  OptionMappingValue,
  'fieldset',
  {
    /** One row per answer the mapped attribute can take. */
    rows: readonly Omit<OptionMappingRow, 'note'>[];
    /** The type's own colour, so a tile is drawn as the node will be. */
    nodeColor?: string;
    /** The type's own shapes, offered after the built-in ones. */
    customShapes?: CustomShapes;
  }
>;

/**
 * The shape each answer of an attribute is drawn as: `OptionMappingField`
 * with a node type's shapes as its options. A row with no shape chosen says
 * that it falls back to the type's default.
 */
export default function ShapeMappingField({
  rows,
  nodeColor,
  customShapes,
  value,
  ...rest
}: ShapeMappingFieldProps) {
  const intl = useAppIntl();
  const options = shapeTileOptions(intl, customShapes);
  const mapped = new Set((Array.isArray(value) ? value : []).map((e) => e.id));

  return (
    <OptionMappingField
      {...rest}
      value={value}
      rows={rows.map((row) =>
        mapped.has(row.id)
          ? row
          : { ...row, note: intl.formatMessage(messages.usesDefaultShape) },
      )}
      options={options}
      renderOption={(option) => {
        const shape = options.find((o) => o.value === option.value)?.shape;
        return shape === undefined ? null : (
          <ShapeTile shape={shape} nodeColor={nodeColor} />
        );
      }}
    />
  );
}
