import type { z } from 'zod';

import {
  collectLocalizedStringsFromSchema,
  type DynamicValueSite,
} from '@codaco/protocol-validation';

/**
 * The site kind the schema declares for the localized text at `path`, or
 * undefined where the text may not show values. The value is probed with a
 * string record at the path, so the walk reports the field as it does for a
 * document. Throws where no localized text is declared at `path`.
 */
export const declaredDynamicValueSite = (
  schema: z.ZodType,
  path: readonly (string | number)[],
): DynamicValueSite | undefined => {
  const probe = path.reduceRight<unknown>(
    (inner, part) => (typeof part === 'number' ? [inner] : { [part]: inner }),
    { en: 'text' },
  );
  const target = path.map((part) => (typeof part === 'number' ? 0 : part));
  const hit = collectLocalizedStringsFromSchema(schema, probe).find(
    (candidate) => candidate.path.join('.') === target.join('.'),
  );
  if (hit === undefined) {
    throw new Error(`No localized text is declared at ${path.join('.')}.`);
  }
  return hit.dynamicValues;
};
