import { Redacted } from 'effect';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import {
  createMessageError,
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
import { resolveNodeShapeReference } from '@codaco/protocol-validation';

import {
  customShapeForAsset,
  customShapeNameIssues,
  customShapeReference,
  type CustomShapes,
  type CustomShapeUsage,
  newCustomShapeId,
  shapeNameFromFile,
} from '../codebook/customShapes.ts';
import { useNodeShapeSvgs } from '../codebook/useNodeShapeSvgs.ts';
import { useResourceClient } from '../resources/client.tsx';
import type {
  NodeShapeNotice,
  RemovedContentKind,
} from '../resources/components/nodeShapeResource.ts';
import ResourceBrowserDialog from '../resources/components/ResourceBrowserDialog.tsx';
import {
  acceptsResourceKind,
  unsupportedResourceKindMessage,
} from '../resources/components/resourceKinds.ts';
import type { ResourceDescriptor } from '../resources/types.ts';

const messages = defineMessages({
  addShape: {
    id: 'protocolBuilder.customShapes.addShape',
    defaultMessage: 'Add a shape',
    description:
      'Button that opens the dialog for choosing or importing an SVG image to use as a custom node shape. A custom shape is an SVG image the researcher added to draw nodes of this type.',
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
  ignoredContent: {
    id: 'protocolBuilder.customShapes.ignoredContent',
    defaultMessage:
      'Some content in this image cannot be used in a node shape and will not be drawn: {removed}.',
    description:
      'Notice shown under a custom node shape made from an SVG image already stored in the protocol. The image is kept as it is, but the listed content is skipped when a node is drawn. removed is a list of the kinds of content, such as "scripts, embedded images and filters".',
  },
  removedKind: {
    id: 'protocolBuilder.customShapes.removedKind',
    defaultMessage:
      '{kind, select, scripts {scripts} images {embedded images} styles {unsupported styles} filters {filters} animations {animations} links {links and references to other files} colors {unrecognized color variables} labelArea {an unusable label area} other {other unsupported content}}',
    description:
      'Name of one kind of content in an SVG image that a custom node shape cannot use. Used as one item of a list in the removedContent and ignoredContent notices, so write it as a phrase that fits there.',
  },
  centredLabel: {
    id: 'protocolBuilder.customShapes.centredLabel',
    defaultMessage:
      'This image has no label area, so the label will be placed in the center of the shape.',
    description:
      'Notice shown under a custom node shape whose SVG image does not say where the node’s label goes.',
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
    defaultMessage: 'Added the shape {name}.',
    description:
      'Screen reader announcement after a custom node shape was added. name is the name the new shape was given.',
  },
  alreadyAddedAnnouncement: {
    id: 'protocolBuilder.customShapes.alreadyAddedAnnouncement',
    defaultMessage:
      'This image is already the shape {name}, so no new shape was added.',
    description:
      'Screen reader announcement when the researcher chose an SVG image that one of this node type’s custom shapes already uses. Focus moves to that shape’s name instead. name is that shape’s name.',
  },
  removedAnnouncement: {
    id: 'protocolBuilder.customShapes.removedAnnouncement',
    defaultMessage:
      'Removed the shape {name}. Its image stays in the protocol’s resources.',
    description:
      'Screen reader announcement after a custom node shape was removed from the node type. The SVG image it was drawn from is not deleted. name is the removed shape’s name.',
  },
});

export const customShapesGuidance = (intl: IntlShape) =>
  intl.formatMessage(messages.guidance, {
    labelAreaId: <code key="labelAreaId">label-area</code>,
    nodeColorToken: <code key="nodeColorToken">var(--node-color)</code>,
  });

const isNodeColor = (value: string): value is NodeColorSequence =>
  NodeColors.some((color) => color === value);

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
 * The node type's own shapes: each one an SVG image from the protocol's
 * resources, named, and removed while nothing uses it. Holds the whole record
 * as one value, so a form treats the set of shapes as a single field.
 *
 * Images are chosen or imported through the resource browser, which checks
 * that an SVG can draw a node before handing it over. Removing a shape leaves
 * its image in the protocol's resources.
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
  const resources = useResourceClient();
  const fieldId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const [notices, setNotices] = useState<
    Readonly<Record<string, NodeShapeNotice>>
  >({});
  /** Encoded, so it follows a change of language while it is on screen. */
  const [announcement, setAnnouncement] = useState('');
  /** The shape whose name takes focus when the browser closes. */
  const chosenShape = useRef<string | undefined>(undefined);
  /** A removal moves focus to the add button once the row has gone. */
  const focusAdd = useRef(false);

  const shapes = value ?? {};
  const shapeSvgs = useNodeShapeSvgs(shapes);
  const nameIssues = customShapeNameIssues(shapes);
  const color = isNodeColor(nodeColor) ? nodeColor : 'node-color-seq-1';
  const locked = disabled || readOnly;

  // A removal re-renders (the value and the announcement change), so this
  // runs once the row, and the button that held focus, have gone.
  useEffect(() => {
    if (!focusAdd.current) return;
    focusAdd.current = false;
    addButtonRef.current?.focus();
  });

  const nameInputOf = (shapeId: string) =>
    listRef.current?.querySelector<HTMLInputElement>(
      `[data-shape-id="${CSS.escape(shapeId)}"] input`,
    ) ?? null;

  const browserFinalFocus = () => {
    const shapeId = chosenShape.current;
    chosenShape.current = undefined;
    return (shapeId === undefined ? null : nameInputOf(shapeId)) ?? true;
  };

  const commit = (next: Record<string, CustomShapes[string]>) => {
    onChange?.(Object.keys(next).length === 0 ? undefined : next);
  };

  const handleSelect = (
    chosen: ResourceDescriptor,
    notice?: NodeShapeNotice,
  ) => {
    setBrowserOpen(false);
    if (!acceptsResourceKind('nodeShape', chosen.kind)) {
      setRefusal(unsupportedResourceKindMessage('nodeShape'));
      return;
    }
    const reference = resources.referenceStaged(chosen.id);
    if (reference.status === 'failed') {
      setRefusal(reference.failure.message);
      return;
    }
    setRefusal(undefined);

    // One image draws one shape: choosing it again goes to the shape that
    // already uses it rather than adding a copy under another name.
    const existing = customShapeForAsset(shapes, chosen.id);
    if (existing !== undefined) {
      setAnnouncement(
        createMessageError(messages.alreadyAddedAnnouncement, {
          name: shapes[existing]?.name.trim() ?? '',
        }),
      );
      chosenShape.current = existing;
      return;
    }

    const shapeId = newCustomShapeId(shapes);
    const shapeName = shapeNameFromFile(
      Redacted.value(chosen.name),
      Object.values(shapes).map((shape) => shape.name),
    );
    commit({ ...shapes, [shapeId]: { name: shapeName, asset: chosen.id } });
    if (notice !== undefined) {
      setNotices((current) => ({ ...current, [shapeId]: notice }));
    }
    setAnnouncement(
      createMessageError(messages.addedAnnouncement, { name: shapeName }),
    );
    chosenShape.current = shapeId;
  };

  const rename = (shapeId: string, shapeName: string) => {
    const shape = shapes[shapeId];
    if (shape === undefined) return;
    commit({ ...shapes, [shapeId]: { ...shape, name: shapeName } });
  };

  const remove = (shapeId: string) => {
    const removedName = shapes[shapeId]?.name.trim() ?? '';
    commit(
      Object.fromEntries(
        Object.entries(shapes).filter(([key]) => key !== shapeId),
      ),
    );
    setAnnouncement(
      createMessageError(messages.removedAnnouncement, { name: removedName }),
    );
    focusAdd.current = true;
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
          ref={listRef}
          className={cx(
            'bg-input text-input-contrast flex flex-col gap-4 rounded border-2 p-4',
            ariaInvalid === true && 'border-destructive',
          )}
        >
          {Object.entries(shapes).map(([shapeId, shape]) => {
            const shapeUsage = usage[shapeId];
            const notice = notices[shapeId];
            const usageId = `${fieldId}-${shapeId}-usage`;
            const nameIssue = nameIssues[shapeId];
            return (
              <li
                key={shapeId}
                data-shape-id={shapeId}
                className="flex flex-col gap-2"
              >
                <div className="flex items-start gap-4">
                  <Node
                    presentational
                    shape={
                      resolveNodeShapeReference(
                        customShapeReference(shapeId),
                        shapes,
                        shapeSvgs,
                      ) ?? 'circle'
                    }
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
          })}
        </ul>
      )}

      <div className="flex flex-col items-start gap-2">
        <Button
          ref={addButtonRef}
          type="button"
          color="dynamic"
          icon={<Plus aria-hidden="true" />}
          disabled={locked}
          onClick={() => setBrowserOpen(true)}
        >
          {intl.formatMessage(messages.addShape)}
        </Button>
      </div>

      {refusal !== undefined && (
        <div role="alert" className="text-destructive-ink text-sm">
          {formatMessageError(refusal, intl) ?? refusal}
        </div>
      )}

      <ResourceBrowserDialog
        open={browserOpen}
        kind="nodeShape"
        onSelect={handleSelect}
        onClose={() => setBrowserOpen(false)}
        disabled={locked}
        finalFocus={browserFinalFocus}
      />

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {formatMessageError(announcement, intl) ?? announcement}
      </span>
    </div>
  );
}

const contentNotice = (intl: IntlShape, notice: NodeShapeNotice) =>
  intl.formatMessage(
    notice.origin === 'imported'
      ? messages.removedContent
      : messages.ignoredContent,
    {
      removed: intl.formatList(
        notice.removed.map((kind: RemovedContentKind) =>
          intl.formatMessage(messages.removedKind, { kind }),
        ),
        { type: 'conjunction' },
      ),
    },
  );
