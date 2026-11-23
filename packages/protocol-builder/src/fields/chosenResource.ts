import type { ResourceClient } from '../resources/client.tsx';
import {
  acceptsResourceKind,
  unsupportedResourceKindMessage,
  type ResourcePickerKind,
} from '../resources/components/resourceKinds.ts';
import type { ResourceDescriptor } from '../resources/types.ts';

/**
 * What a field that holds resources of `kind` makes of one chosen in the
 * resource browser: taken, by its id, or refused, with why, encoded as a
 * message error (`ResourceRefusal` shows it).
 *
 * The browser asks the host for the kinds the field accepts, but a host may
 * answer with more than it was asked for, and a browser can be left open
 * across a change: a roster in a field for an image is a protocol the schema
 * refuses. And the edit is asked whether the resource can still be taken,
 * since another field may have started discarding it a moment ago and only
 * the edit knows a discard is in flight: a field that took it anyway would
 * name bytes the host is in the middle of deleting.
 */
export const takeChosenResource = (
  resources: Pick<ResourceClient, 'referenceStaged'>,
  kind: ResourcePickerKind,
  chosen: ResourceDescriptor,
):
  | Readonly<{ status: 'taken'; id: string }>
  | Readonly<{ status: 'refused'; message: string }> => {
  if (!acceptsResourceKind(kind, chosen.kind)) {
    return { status: 'refused', message: unsupportedResourceKindMessage(kind) };
  }
  const reference = resources.referenceStaged(chosen.id);
  if (reference.status === 'failed') {
    return { status: 'refused', message: reference.failure.message };
  }
  return { status: 'taken', id: chosen.id };
};
