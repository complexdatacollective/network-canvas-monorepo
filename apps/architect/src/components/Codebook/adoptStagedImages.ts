import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { FlattenedErrors } from '@codaco/fresco-ui/form/store/types';
import {
  customShapeForAsset,
  readCustomShapes,
} from '@codaco/protocol-builder/codebook/customShapes';
import type { StagedResources } from '@codaco/protocol-builder/resources/client';
import { CUSTOM_SHAPES_FIELD } from '~/components/TypeEditor/validateEntityType';
import type { ArchitectClient } from '~/protocolBuilder/client';

const messages = defineMessages({
  shapeImageUnavailable: {
    id: 'architect.codebook.entityTypeDialog.shapeImageUnavailable',
    defaultMessage:
      'The image for the shape "{name}" is no longer available. Remove this shape and add it again.',
    description:
      'Refusal shown under the custom shapes field of the node type editor when saving fails because the SVG image one custom shape is drawn from can no longer be kept with the protocol. name is the name the researcher gave that shape.',
  },
  imageUnavailable: {
    id: 'architect.codebook.entityTypeDialog.imageUnavailable',
    defaultMessage:
      'An image added to this node type is no longer available. Remove the shape that uses it and add it again.',
    description:
      'Refusal shown under the custom shapes field of the node type editor when saving fails because an SVG image added for a custom shape can no longer be kept with the protocol, and the shape that uses it cannot be identified.',
  },
});

type StagedImageAdoption =
  | Readonly<{ status: 'failed'; fieldErrors: FlattenedErrors['fieldErrors'] }>
  | Readonly<{ status: 'ok'; keep: () => void }>;

/**
 * Checks, before a type is saved, that every image this edit imported can be
 * kept with the protocol, so a type is never written naming an image it could
 * not keep.
 *
 * Architect has already written each imported image to the protocol's assets;
 * `keep`, called once the save succeeds, hands them over so the edit's cancel
 * no longer removes them.
 */
export function adoptStagedImages(
  staged: StagedResources,
  planStagedResourceAdoption: ArchitectClient['planStagedResourceAdoption'],
  values: Record<string, FieldValue>,
): StagedImageAdoption {
  const promotion = staged.promotion();
  if (promotion === undefined) {
    return { status: 'ok', keep: () => undefined };
  }
  const adoption = planStagedResourceAdoption(promotion);
  if (adoption.status === 'ok') {
    return {
      status: 'ok',
      keep: () => {
        adoption.complete();
        staged.promoted();
      },
    };
  }

  const shapes = readCustomShapes(values[CUSTOM_SHAPES_FIELD]);
  const shapeId =
    adoption.resourceId === undefined
      ? undefined
      : customShapeForAsset(shapes, adoption.resourceId);
  const shapeName = shapeId === undefined ? undefined : shapes?.[shapeId]?.name;
  return {
    status: 'failed',
    fieldErrors: {
      [CUSTOM_SHAPES_FIELD]: [
        shapeName === undefined
          ? createMessageError(messages.imageUnavailable)
          : createMessageError(messages.shapeImageUnavailable, {
              name: shapeName,
            }),
      ],
    },
  };
}
