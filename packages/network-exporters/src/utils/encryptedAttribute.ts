import type { Variable } from '@codaco/protocol-validation';
import {
  type NcEntity,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { getEntityAttributes, getOwn } from './general';

/**
 * Whether an entity's stored value of `attribute` is ciphertext, which is
 * exported as a marker in its place.
 *
 * An entity records how each value it holds was encrypted, and writing a value
 * in the clear removes that record, so a value with one is ciphertext whatever
 * the codebook says. A value of a variable the codebook encrypts is also
 * ciphertext when it is stored as encryption stores it, as bytes, though its
 * record is missing. Any other value was written in the clear, such as a name
 * from a roster, and is exported as it is stored, as the interview shows it.
 */
export const isEncryptedAttribute = (
  entity: NcEntity,
  attribute: string,
  variable: Variable | undefined,
): boolean => {
  if (getOwn(entity[entitySecureAttributesMeta], attribute) !== undefined) {
    return true;
  }
  if (!variable?.encrypted) return false;
  const value = getOwn(getEntityAttributes(entity), attribute);
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'number')
  );
};
