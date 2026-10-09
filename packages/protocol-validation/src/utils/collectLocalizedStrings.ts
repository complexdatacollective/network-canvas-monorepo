import { z } from 'zod';

import type { MessageArguments } from '../localization/messageArguments.ts';
import {
  getLocalizedStringDescriptor,
  type LocalizedString,
  type LocalizedStringFormat,
} from '../schemas/9/localized-string.ts';
// Imported from its own module for the reason given in
// `collectEntityAttributeReferences.ts`: the schema module calls back into
// this one, and `../schemas/index.ts` would read the schema before it exists.
import ProtocolSchemaV9 from '../schemas/9/schema.ts';

export type LocalizedStringHit = Readonly<{
  path: (string | number)[];
  value: LocalizedString;
  format: LocalizedStringFormat;
  /** The arguments a localized message may use; absent for literal text. */
  arguments?: MessageArguments;
}>;

export type LocalizedStringSite = Readonly<{
  path: (string | number)[];
  value: unknown;
  format: LocalizedStringFormat;
  /** The arguments a localized message may use; absent for literal text. */
  arguments?: MessageArguments;
  /** The tagged declaration, shared by every site it describes. */
  schema: z.ZodType;
  /** The owning object lets the field be left out. */
  optional: boolean;
  /** The owning object keeps keys it does not declare, of any type. */
  looseContainer: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isZodType = (value: unknown): value is z.ZodType =>
  value instanceof z.ZodType;

const isLocalizedStringValue = (value: unknown): value is LocalizedString =>
  isRecord(value) &&
  Object.values(value).every((text) => typeof text === 'string');

// A pipe is read from its input side, which carries the same tags at the same
// paths as its narrowed output and still matches an in-progress edit.
const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  for (;;) {
    if (getLocalizedStringDescriptor(current)) return current;
    let inner: unknown;
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault ||
      current instanceof z.ZodPrefault ||
      current instanceof z.ZodNonOptional ||
      current instanceof z.ZodReadonly ||
      current instanceof z.ZodCatch
    ) {
      inner = current.def.innerType;
    } else if (current instanceof z.ZodLazy) {
      inner = current.def.getter();
    } else if (current instanceof z.ZodPipe) {
      inner = current.in;
    }
    if (!isZodType(inner)) return current;
    current = inner;
  }
};

// The protocol schema is static, so each node's answer is computed once and
// the walk skips the large regions that hold no participant copy.
const subtreeHasLocalizedString = new WeakMap<z.ZodType, boolean>();
const hasLocalizedString = (schema: z.ZodType): boolean => {
  const node = unwrap(schema);
  const cached = subtreeHasLocalizedString.get(node);
  if (cached !== undefined) return cached;
  subtreeHasLocalizedString.set(node, false);
  let result = getLocalizedStringDescriptor(node) !== undefined;
  if (!result) {
    if (node instanceof z.ZodObject) {
      result = Object.values(node.shape).some(
        (child: unknown) => isZodType(child) && hasLocalizedString(child),
      );
    } else if (node instanceof z.ZodArray) {
      const element: unknown = node.element;
      result = isZodType(element) && hasLocalizedString(element);
    } else if (node instanceof z.ZodRecord) {
      const valueType: unknown = node.valueType;
      result = isZodType(valueType) && hasLocalizedString(valueType);
    } else if (node instanceof z.ZodUnion) {
      result = node.options.some(
        (option) => isZodType(option) && hasLocalizedString(option),
      );
    }
  }
  subtreeHasLocalizedString.set(node, result);
  return result;
};

const literalValuesOf = (schema: z.ZodType): unknown[] | undefined => {
  const node = unwrap(schema);
  if (node instanceof z.ZodLiteral) return [...node.values];
  if (node instanceof z.ZodEnum) return node.options;
  return undefined;
};

/**
 * The union branches a value can belong to, judged only by literal and enum
 * fields: the discriminator of a discriminated union, or any field that every
 * branch of a plain union pins (a variable's `type`). Nothing is parsed, so
 * no transform runs. A value no branch accepts is walked against every branch,
 * so an invalid document still reports the copy it holds.
 */
const candidateOptions = (
  union: z.ZodUnion,
  value: Record<string, unknown>,
): z.ZodType[] => {
  const options = union.options.filter(isZodType);
  const shapes = options.map((option) => {
    const node = unwrap(option);
    return node instanceof z.ZodObject ? node.shape : undefined;
  });
  const fields =
    union instanceof z.ZodDiscriminatedUnion
      ? [union.def.discriminator]
      : Object.keys(shapes[0] ?? {});
  for (const field of fields) {
    const accepted = shapes.map((shape) => {
      const fieldSchema: unknown = shape?.[field];
      return isZodType(fieldSchema) ? literalValuesOf(fieldSchema) : undefined;
    });
    if (!accepted.every((values) => values !== undefined)) continue;
    const matching = options.filter((_option, index) =>
      accepted[index]?.includes(value[field]),
    );
    if (matching.length > 0) return matching;
  }
  return options;
};

// Whether a field may be left out is asked of its declaration once.
const fieldIsOptional = new WeakMap<z.ZodType, boolean>();
const isOptionalField = (field: z.ZodType): boolean => {
  const cached = fieldIsOptional.get(field);
  if (cached !== undefined) return cached;
  const result = field.safeParse(undefined).success;
  fieldIsOptional.set(field, result);
  return result;
};

type SiteContext = Pick<LocalizedStringSite, 'optional' | 'looseContainer'>;

const UNKEYED: SiteContext = { optional: false, looseContainer: false };

const walk = (
  schema: z.ZodType,
  value: unknown,
  path: (string | number)[],
  context: SiteContext,
): LocalizedStringSite[] => {
  if (value === undefined) return [];
  const node = unwrap(schema);

  const descriptor = getLocalizedStringDescriptor(node);
  if (descriptor) {
    return [
      {
        path,
        value,
        format: descriptor.format,
        ...(descriptor.arguments === undefined
          ? {}
          : { arguments: descriptor.arguments }),
        schema: node,
        ...context,
      },
    ];
  }

  if (node instanceof z.ZodObject) {
    if (!isRecord(value)) return [];
    const shape = node.shape;
    const catchall: unknown = node.def.catchall;
    const looseContainer =
      isZodType(catchall) && !(catchall instanceof z.ZodNever);
    return Object.keys(shape).flatMap((key) => {
      const child: unknown = shape[key];
      if (!isZodType(child) || !hasLocalizedString(child)) return [];
      return walk(child, value[key], [...path, key], {
        optional: isOptionalField(child),
        looseContainer,
      });
    });
  }

  if (node instanceof z.ZodArray) {
    if (!Array.isArray(value)) return [];
    const element: unknown = node.element;
    if (!isZodType(element)) return [];
    return value.flatMap((item, index) =>
      walk(element, item, [...path, index], UNKEYED),
    );
  }

  if (node instanceof z.ZodRecord) {
    if (!isRecord(value)) return [];
    const valueType: unknown = node.valueType;
    if (!isZodType(valueType)) return [];
    return Object.keys(value).flatMap((key) =>
      walk(valueType, value[key], [...path, key], UNKEYED),
    );
  }

  if (node instanceof z.ZodUnion) {
    const options = isRecord(value)
      ? candidateOptions(node, value)
      : node.options.filter(isZodType);
    // Branches that agree on the value's literals can still differ in shape,
    // so each is walked and a site two of them share is reported once.
    const sites = new Map<string, LocalizedStringSite>();
    for (const option of options) {
      if (!hasLocalizedString(option)) continue;
      for (const site of walk(option, value, path, context)) {
        sites.set(JSON.stringify(site.path), site);
      }
    }
    return [...sites.values()];
  }

  return [];
};

/**
 * Every value that sits where `schema` declares a localized string, whatever
 * its current form, found from the `localizedString` tags in the schema rather
 * than from a list of paths. A site whose value is absent is not reported.
 *
 * Unlike `collectLocalizedStringsFromSchema`, a site holding something other
 * than a record of strings is reported too, so a document written before its
 * copy was localized can be read against the localized schema.
 */
export const collectLocalizedStringSites = (
  schema: z.ZodType,
  value: unknown,
): LocalizedStringSite[] => walk(schema, value, [], UNKEYED);

/**
 * Every participant-facing string in a value shaped like `schema`, found from
 * the `localizedString` tags in the schema rather than from a list of paths,
 * so a field converted to a localized string is covered without being
 * registered anywhere else.
 *
 * A site whose value is not a record of strings is skipped: schema validation
 * reports it, and the walk tolerates invalid and partial documents.
 */
export const collectLocalizedStringsFromSchema = (
  schema: z.ZodType,
  value: unknown,
): LocalizedStringHit[] =>
  collectLocalizedStringSites(schema, value).flatMap((site) =>
    isLocalizedStringValue(site.value)
      ? [
          {
            path: site.path,
            value: site.value,
            format: site.format,
            ...(site.arguments === undefined
              ? {}
              : { arguments: site.arguments }),
          },
        ]
      : [],
  );

export const collectLocalizedStrings = (
  protocol: unknown,
): LocalizedStringHit[] =>
  collectLocalizedStringsFromSchema(ProtocolSchemaV9, protocol);
