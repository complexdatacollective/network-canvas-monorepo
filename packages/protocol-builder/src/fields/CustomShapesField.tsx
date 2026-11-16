import { Redacted } from 'effect';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  defineMessages,
  formatMessageError,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { isNodeColorSequence } from '@codaco/fresco-ui/Node';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { resolveNodeShapeReference } from '@codaco/protocol-validation';

import {
  customShapeForAsset,
  customShapeNameIssues,
  customShapeReference,
  type CustomShapes,
  type CustomShapeUsage,
  newCustomShapeId,
  shapeAssetIds,
  shapeNameFromFile,
} from '../codebook/customShapes.ts';
import { useNodeShapeSvgs } from '../codebook/useNodeShapeSvgs.ts';
import { useResourceClient } from '../resources/client.tsx';
import type { NodeShapeNotice } from '../resources/components/nodeShapeResource.ts';
import ResourceBrowserDialog from '../resources/components/ResourceBrowserDialog.tsx';
import {
  acceptsResourceKind,
  unsupportedResourceKindMessage,
} from '../resources/components/resourceKinds.ts';
import type { ResourceDescriptor } from '../resources/types.ts';
import CustomShapeRow from './CustomShapeRow.tsx';

const messages = defineMessages({
  addShape: {
    id: 'protocolBuilder.customShapes.addShape',
    defaultMessage: 'Add a shape',
    description:
      'Button that opens the dialog for choosing or importing an SVG image to use as a custom node shape. A custom shape is an SVG image the researcher added to draw nodes of this type.',
  },
  guidance: {
    id: 'protocolBuilder.customShapes.guidance',
    defaultMessage:
      'Add your own shapes for this node type from SVG files. To choose where the label goes, draw a rectangle with the id {labelAreaId}; its fill sets the color of the label. To draw part of a shape in this node type’s color, use {nodeColorToken} as its fill or stroke.',
    description:
      'Guidance under the custom shapes heading in the node type editor. labelAreaId is the literal text label-area and nodeColorToken is the literal text var(--node-color), both shown as code and never translated. SVG is a file format name and is not translated.',
  },
});

export const customShapesGuidance = (intl: IntlShape) =>
  intl.formatMessage(messages.guidance, {
    labelAreaId: <code key="labelAreaId">label-area</code>,
    nodeColorToken: <code key="nodeColorToken">var(--node-color)</code>,
  });

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
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
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

  const shapes = value ?? {};
  const shapeSvgs = useNodeShapeSvgs(shapeAssetIds(shapes));
  const nameIssues = customShapeNameIssues(shapes);
  const color = isNodeColorSequence(nodeColor) ? nodeColor : 'node-color-seq-1';
  const locked = disabled || readOnly;

  const browserFinalFocus = () => {
    const shapeId = chosenShape.current;
    chosenShape.current = undefined;
    return (
      (shapeId === undefined ? undefined : nameInputs.current.get(shapeId)) ??
      true
    );
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
        `This image is already the shape ${shapes[existing]?.name.trim() ?? ''}, so no new shape was added.`,
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
    setAnnouncement(`Added the shape ${shapeName}.`);
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
      `Removed the shape ${removedName}. Its image stays in the protocol’s resources.`,
    );
    // The add button is outside every row and never unmounts, so focus can
    // move to it before the removed row, which held it, has gone.
    addButtonRef.current?.focus();
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
          {Object.entries(shapes).map(([shapeId, shape]) => (
            <CustomShapeRow
              key={shapeId}
              name={`${name ?? 'customShapes'}.${shapeId}.name`}
              shape={shape}
              preview={resolveNodeShapeReference(
                customShapeReference(shapeId),
                shapes,
                shapeSvgs,
              )}
              color={color}
              usage={usage[shapeId]}
              notice={notices[shapeId]}
              nameIssue={nameIssues[shapeId]}
              disabled={disabled}
              readOnly={readOnly}
              nameInputRef={(input) => {
                if (input !== null) nameInputs.current.set(shapeId, input);
                return () => {
                  nameInputs.current.delete(shapeId);
                };
              }}
              onRename={(shapeName) => rename(shapeId, shapeName)}
              onRemove={() => remove(shapeId)}
            />
          ))}
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

      <span className="sr-only" aria-live="polite" aria-atomic="true" lang="en">
        {announcement}
      </span>
    </div>
  );
}
