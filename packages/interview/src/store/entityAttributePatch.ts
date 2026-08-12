import {
  type entityAttributesProperty,
  type entitySecureAttributesMeta,
  type NcEntity,
  type VariableValue,
} from '@codaco/shared-consts';

export type AttributePatch = Readonly<{
  set: Readonly<Record<string, VariableValue>>;
  unset: readonly string[];
}>;

export type AttributePatchValidationResult =
  | { success: true }
  | {
      success: false;
      error: {
        code: 'unknown-keys' | 'overlapping-keys';
        keys: readonly string[];
      };
    };

type SecureAttributeMetadata = NonNullable<
  NcEntity[typeof entitySecureAttributesMeta]
>;

type LegacyAttributeValue = VariableValue | null | undefined;

function writeOwnProperty<T>(
  target: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

export function validateAttributePatch(
  patch: AttributePatch,
  allowedKeys: ReadonlySet<string>,
): AttributePatchValidationResult {
  const setKeys = Object.keys(patch.set);
  const unsetKeys = new Set(patch.unset);
  const overlappingKeys = setKeys.filter((key) => unsetKeys.has(key));

  if (overlappingKeys.length > 0) {
    return {
      success: false,
      error: { code: 'overlapping-keys', keys: overlappingKeys },
    };
  }

  const unknownKeys = [...new Set([...setKeys, ...patch.unset])].filter(
    (key) => !allowedKeys.has(key),
  );

  if (unknownKeys.length > 0) {
    return {
      success: false,
      error: { code: 'unknown-keys', keys: unknownKeys },
    };
  }

  return { success: true };
}

export function applyEntityAttributePatch(
  attributes: Readonly<Record<string, LegacyAttributeValue>>,
  secureAttributes: SecureAttributeMetadata | undefined,
  patch: AttributePatch,
  secureSet?: SecureAttributeMetadata,
): {
  attributes: NcEntity[typeof entityAttributesProperty];
  secureAttributes: SecureAttributeMetadata | undefined;
} {
  const nextAttributes: Record<string, VariableValue> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) {
      writeOwnProperty(nextAttributes, key, value);
    }
  }

  const nextSecureAttributes: SecureAttributeMetadata = {};
  for (const [key, value] of Object.entries(secureAttributes ?? {})) {
    writeOwnProperty(nextSecureAttributes, key, value);
  }

  for (const key of patch.unset) {
    delete nextAttributes[key];
    delete nextSecureAttributes[key];
  }

  for (const [key, value] of Object.entries(patch.set)) {
    writeOwnProperty(nextAttributes, key, value);
  }

  for (const [key, value] of Object.entries(secureSet ?? {})) {
    writeOwnProperty(nextSecureAttributes, key, value);
  }

  return {
    attributes: nextAttributes,
    secureAttributes:
      Object.keys(nextSecureAttributes).length > 0
        ? nextSecureAttributes
        : undefined,
  };
}
