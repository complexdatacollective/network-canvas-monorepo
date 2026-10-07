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
 * Encryption stores bytes, so only bytes can be ciphertext. They are when the
 * entity records how they were encrypted, whatever the codebook says, and
 * when the codebook encrypts the variable, though their record is missing.
 * Any other value was written in the clear, such as a name from a roster, and
 * is exported as it is stored, as the interview shows it, even with a record:
 * an earlier runtime left the record in place when a plaintext answer
 * replaced an encrypted one.
 */
export const isEncryptedAttribute = (
  entity: NcEntity,
  attribute: string,
  variable: Variable | undefined,
): boolean => {
  const value = getOwn(getEntityAttributes(entity), attribute);
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'number')
  ) {
    return false;
  }
  return (
    getOwn(entity[entitySecureAttributesMeta], attribute) !== undefined ||
    variable?.encrypted === true
  );
};
