import { Schema } from 'effect';

import {
  PresenceSchema,
  ResourceDescriptorSchema,
} from '@codaco/protocol-builder-core/contract/schemas';

export type StoredPresence = typeof PresenceSchema.Encoded;
export type StoredResourceDescriptor = typeof ResourceDescriptorSchema.Encoded;

export const storedPresence = Schema.encodeSync(PresenceSchema);
export const presenceOf = Schema.decodeUnknownSync(PresenceSchema);

export const storedDescriptor = Schema.encodeSync(ResourceDescriptorSchema);
export const descriptorOf = Schema.decodeUnknownSync(ResourceDescriptorSchema);
