import { Trash2 } from 'lucide-react';
import { type Ref, useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Node, {
  type NodeColorSequence,
  type NodeShapeProp,
} from '@codaco/fresco-ui/Node';

import type {
  CustomShapes,
  CustomShapeUsage,
} from '../codebook/customShapes.ts';
import {
  contentNotice,
  type NodeShapeNotice,
} from '../resources/components/nodeShapeResource.ts';

const messages = defineMessages({
  nameLabel: {
    id: 'protocolBuilder.customShapes.nameLabel',
    defaultMessage: 'Shape name',
    description:
      'Label of the name field of one custom node shape. A custom shape is an SVG image the researcher added to draw nodes of this type; the name identifies it in the shape pickers.',
  },
  previewLabel: {
    id: 'protocolBuilder.customShapes.previewLabel',
    defaultMessage: 'Label',
    description:
      'Sample text drawn inside the preview of a custom node shape, to show where and in what color a node’s label will appear. Keep it short.',
  },
  inUse: {
    id: 'protocolBuilder.customShapes.inUse',
    defaultMessage:
      '{usage, select, default {Used as the default shape. To remove this shape, choose another default shape.} mapping {Used in the shape mapping. To remove this shape, choose other shapes there.} other {Used as the default shape and in the shape mapping. To remove this shape, choose other shapes in both places.}}',
    description:
      'Shown beside a custom node shape that cannot be removed because the node type uses it. usage says where: as the default shape, in the mapping from an attribute to shapes, or both.',
  },
  centredLabel: {
    id: 'protocolBuilder.customShapes.centredLabel',
    defaultMessage:
      'This image has no label area, so the label will be placed in the center of the shape.',
    description:
      'Notice shown under a custom node shape whose SVG image does not say where the node’s label goes.',
  },
});

type CustomShapeRowProps = Readonly<{
  /** The form name of the shape's name field. */
  name: string;
  shape: CustomShapes[string];
  /** What the preview draws: the shape itself once its image has been read. */
  preview: NodeShapeProp;
  color: NodeColorSequence;
  /** Where the shape is used; a shape in use cannot be removed. */
  usage?: CustomShapeUsage;
  /** What was said about the shape's image when it was chosen. */
  notice?: NodeShapeNotice;
  /** What is wrong with the shape's name, encoded. */
  nameIssue?: string;
  disabled: boolean;
  readOnly: boolean;
  nameInputRef?: Ref<HTMLInputElement>;
  onRename: (name: string) => void;
  onRemove: () => void;
}>;

/** One custom shape: its preview, its name, and the button that removes it. */
export default function CustomShapeRow({
  name,
  shape,
  preview,
  color,
  usage,
  notice,
  nameIssue,
  disabled,
  readOnly,
  nameInputRef,
  onRename,
  onRemove,
}: CustomShapeRowProps) {
  const intl = useAppIntl();
  const usageId = useId();

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start gap-4">
        <Node
          presentational
          shape={preview}
          color={color}
          label={intl.formatMessage(messages.previewLabel)}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <UnconnectedField
            name={name}
            label={intl.formatMessage(messages.nameLabel)}
            component={InputField}
            ref={nameInputRef}
            value={shape.name}
            onChange={(next) => onRename(next ?? '')}
            required
            disabled={disabled}
            readOnly={readOnly}
            errors={nameIssue === undefined ? undefined : [nameIssue]}
            showErrors
          />
        </div>
        <IconButton
          icon={<Trash2 aria-hidden="true" />}
          color="destructive"
          variant="text"
          disabled={disabled || readOnly || usage !== undefined}
          onClick={onRemove}
          aria-label={`Remove shape ${shape.name.trim()}`}
          aria-describedby={usage === undefined ? undefined : usageId}
        />
      </div>
      {usage !== undefined && (
        <p id={usageId} className="text-sm">
          {intl.formatMessage(messages.inUse, { usage })}
        </p>
      )}
      {notice !== undefined &&
        (notice.removed.length > 0 || notice.centredLabel) && (
          <Alert variant="info" appearance="soft" density="compact">
            <AlertDescription>
              {notice.removed.length > 0 && (
                <p>{contentNotice(intl, notice)}</p>
              )}
              {notice.centredLabel && (
                <p>{intl.formatMessage(messages.centredLabel)}</p>
              )}
            </AlertDescription>
          </Alert>
        )}
    </li>
  );
}
