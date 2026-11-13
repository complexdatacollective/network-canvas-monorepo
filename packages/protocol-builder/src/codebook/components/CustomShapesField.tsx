import { Trash2, Upload } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';

import {
  defineMessages,
  formatMessageError,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Node, {
  NodeColors,
  type NodeColorSequence,
} from '@codaco/fresco-ui/Node';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  customShapeNameIssues,
  type CustomShapes,
  type CustomShapeUsage,
  type ImportedCustomShape,
  importCustomShape,
  isOversizeShapeFile,
  newCustomShapeId,
  oversizeShapeFileMessage,
  type RemovedContentKind,
  shapeNameFromFile,
  unreadableShapeFileMessage,
} from '../customShapes.ts';

const messages = defineMessages({
  addShapes: {
    id: 'protocolBuilder.customShapes.addShapes',
    defaultMessage: 'Add shapes from SVG files',
    description:
      'Button that opens a file chooser for adding custom node shapes. Several SVG files can be chosen at once. SVG is a file format name and is not translated.',
  },
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
  remove: {
    id: 'protocolBuilder.customShapes.remove',
    defaultMessage: 'Remove shape {name}',
    description:
      'Accessible name of the button that removes one custom node shape from the node type. name is the shape’s name.',
  },
  inUse: {
    id: 'protocolBuilder.customShapes.inUse',
    defaultMessage:
      '{usage, select, default {Used as the default shape. Choose another default shape to remove it.} mapping {Used in the shape mapping. Choose other shapes there to remove it.} other {Used as the default shape and in the shape mapping. Choose other shapes in both places to remove it.}}',
    description:
      'Shown beside a custom node shape that cannot be removed because the node type uses it. usage says where: as the default shape, in the mapping from an attribute to shapes, or both.',
  },
  removedContent: {
    id: 'protocolBuilder.customShapes.removedContent',
    defaultMessage:
      'Some content in this file cannot be used in a node shape and was left out: {removed}.',
    description:
      'Notice shown under a custom node shape that was added from an SVG file after unsupported content was removed from it. removed is a list of the kinds of content, such as "scripts, embedded images and filters".',
  },
  removedKind: {
    id: 'protocolBuilder.customShapes.removedKind',
    defaultMessage:
      '{kind, select, scripts {scripts} images {embedded images} styles {style sheets and styles} filters {filters} animations {animations} links {links and references to other files} colors {unrecognized color variables} labelArea {an unusable label area} other {other unsupported content}}',
    description:
      'Name of one kind of content removed from an SVG file added as a custom node shape. Used as one item of a list in the removedContent notice, so write it as a phrase that fits there.',
  },
  centredLabel: {
    id: 'protocolBuilder.customShapes.centredLabel',
    defaultMessage:
      'This file has no label area, so the label will be placed in the center of the shape.',
    description:
      'Notice shown under a custom node shape whose SVG file does not say where the node’s label goes.',
  },
  guidance: {
    id: 'protocolBuilder.customShapes.guidance',
    defaultMessage:
      'Add your own shapes for this node type from SVG files. To choose where the label goes, draw a rectangle with the id {labelAreaId}; its fill sets the color of the label. To draw part of a shape in this node type’s color, use {nodeColorToken} as its fill or stroke.',
    description:
      'Guidance under the custom shapes heading in the node type editor. labelAreaId is the literal text label-area and nodeColorToken is the literal text var(--node-color), both shown as code and never translated. SVG is a file format name and is not translated.',
  },
  addedAnnouncement: {
    id: 'protocolBuilder.customShapes.addedAnnouncement',
    defaultMessage:
      '{count, plural, one {Added # shape.} other {Added # shapes.}}',
    description:
      'Screen reader announcement after custom node shapes were added from SVG files. count is how many were added.',
  },
});

export const customShapesGuidance = (intl: IntlShape) =>
  intl.formatMessage(messages.guidance, {
    labelAreaId: <code key="labelAreaId">label-area</code>,
    nodeColorToken: <code key="nodeColorToken">var(--node-color)</code>,
  });

const isNodeColor = (value: string): value is NodeColorSequence =>
  NodeColors.some((color) => color === value);

type ImportNotice = Pick<ImportedCustomShape, 'removed' | 'centredLabel'>;

export type CustomShapesFieldProps = CreateFormFieldProps<
  CustomShapes,
  'div',
  {
    /** The type's own colour, so a preview is drawn as the node will be. */
    nodeColor?: string;
    /** Where each shape is used; a shape in use cannot be removed. */
    usage?: Readonly<Record<string, CustomShapeUsage>>;
  }
>;

/**
 * The node type's own shapes: added from SVG files, named, and removed while
 * nothing uses them. Holds the whole record as one value, so a form treats
 * the set of shapes as a single field.
 */
export default function CustomShapesField({
  id,
  name,
  value,
  onChange,
  nodeColor = 'node-color-seq-1',
  usage = {},
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: CustomShapesFieldProps) {
  const intl = useAppIntl();
  const inputId = useId();
  const [fileErrors, setFileErrors] = useState<readonly string[]>([]);
  const [notices, setNotices] = useState<
    Readonly<Record<string, ImportNotice>>
  >({});
  const [announcement, setAnnouncement] = useState('');

  const shapes = value ?? {};
  const nameIssues = customShapeNameIssues(shapes);
  const color = isNodeColor(nodeColor) ? nodeColor : 'node-color-seq-1';
  const locked = disabled || readOnly;

  const commit = (next: Record<string, CustomShapes[string]>) => {
    onChange?.(Object.keys(next).length === 0 ? undefined : next);
  };

  const addFiles = async (files: readonly File[]) => {
    const next: Record<string, CustomShapes[string]> = { ...shapes };
    const errors: string[] = [];
    const added: Record<string, ImportNotice> = {};
    for (const file of files) {
      if (isOversizeShapeFile(file.size)) {
        errors.push(oversizeShapeFileMessage(file.name));
        continue;
      }
      let source: string;
      try {
        source = await file.text();
      } catch {
        errors.push(unreadableShapeFileMessage(file.name));
        continue;
      }
      const result = importCustomShape(
        shapeNameFromFile(
          file.name,
          Object.values(next).map((shape) => shape.name),
        ),
        file.name,
        source,
      );
      if (!result.success) {
        errors.push(result.error);
        continue;
      }
      const shapeId = newCustomShapeId(next);
      next[shapeId] = result.imported.shape;
      added[shapeId] = {
        removed: result.imported.removed,
        centredLabel: result.imported.centredLabel,
      };
    }
    setFileErrors(errors);
    setNotices((current) => ({ ...current, ...added }));
    const addedCount = Object.keys(added).length;
    setAnnouncement(
      addedCount === 0
        ? ''
        : intl.formatMessage(messages.addedAnnouncement, { count: addedCount }),
    );
    if (addedCount > 0) commit(next);
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Cleared so choosing the same file again, after fixing it, still raises
    // a change event.
    event.target.value = '';
    if (files.length > 0) void addFiles(files);
  };

  const rename = (shapeId: string, shapeName: string) => {
    const shape = shapes[shapeId];
    if (shape === undefined) return;
    commit({ ...shapes, [shapeId]: { ...shape, name: shapeName } });
  };

  const remove = (shapeId: string) => {
    commit(
      Object.fromEntries(
        Object.entries(shapes).filter(([key]) => key !== shapeId),
      ),
    );
  };

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={
        ariaLabelledBy ?? (id === undefined ? undefined : `${id}-label`)
      }
      aria-describedby={ariaDescribedBy}
      className="flex flex-col gap-4"
    >
      {Object.keys(shapes).length > 0 && (
        <ul
          className={cx(
            'bg-input text-input-contrast flex flex-col gap-4 rounded border-2 p-4',
            ariaInvalid === true && 'border-destructive',
          )}
        >
          {Object.entries(shapes).map(([shapeId, shape]) => {
            const shapeUsage = usage[shapeId];
            const notice = notices[shapeId];
            const usageId = `${inputId}-${shapeId}-usage`;
            const nameIssue = nameIssues[shapeId];
            return (
              <li key={shapeId} className="flex flex-col gap-2">
                <div className="flex items-start gap-4">
                  <Node
                    presentational
                    shape={{ svg: shape.svg }}
                    color={color}
                    label={intl.formatMessage(messages.previewLabel)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <UnconnectedField
                      name={`${name ?? 'customShapes'}.${shapeId}.name`}
                      label={intl.formatMessage(messages.nameLabel)}
                      component={InputField}
                      value={shape.name}
                      onChange={(next) => rename(shapeId, next ?? '')}
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
                    disabled={locked || shapeUsage !== undefined}
                    onClick={() => remove(shapeId)}
                    aria-label={intl.formatMessage(messages.remove, {
                      name: shape.name.trim(),
                    })}
                    aria-describedby={
                      shapeUsage === undefined ? undefined : usageId
                    }
                  />
                </div>
                {shapeUsage !== undefined && (
                  <p id={usageId} className="text-sm">
                    {intl.formatMessage(messages.inUse, { usage: shapeUsage })}
                  </p>
                )}
                {notice !== undefined &&
                  (notice.removed.length > 0 || notice.centredLabel) && (
                    <Alert variant="info" appearance="soft" density="compact">
                      <AlertDescription>
                        {notice.removed.length > 0 && (
                          <p>{removedContentNotice(intl, notice.removed)}</p>
                        )}
                        {notice.centredLabel && (
                          <p>{intl.formatMessage(messages.centredLabel)}</p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col items-start gap-2">
        <input
          id={inputId}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          disabled={locked}
          className="peer sr-only"
          onChange={handleFiles}
        />
        <Button asChild icon={<Upload aria-hidden="true" />}>
          <label
            htmlFor={inputId}
            className="peer-focus-visible:focus-styles peer-focus-visible:outline-primary peer-disabled:active:elevation-low! peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-disabled:active:translate-y-0!"
          >
            {intl.formatMessage(messages.addShapes)}
          </label>
        </Button>
      </div>

      {fileErrors.length > 0 && (
        <div
          role="alert"
          className="text-destructive-ink flex flex-col gap-1 text-sm"
        >
          {fileErrors.map((error) => (
            <p key={error}>{formatMessageError(error, intl) ?? error}</p>
          ))}
        </div>
      )}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}

const removedContentNotice = (
  intl: IntlShape,
  removed: readonly RemovedContentKind[],
) =>
  intl.formatMessage(messages.removedContent, {
    removed: intl.formatList(
      removed.map((kind) => intl.formatMessage(messages.removedKind, { kind })),
      { type: 'conjunction' },
    ),
  });
