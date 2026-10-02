import { normalizeForComparison, toCanonicalText } from '@codaco/shared-consts';

// File systems cap a single name at 255 bytes, not characters.
const MAX_FILE_NAME_BYTES = 255;

const PATH_UNSAFE = /[\\/:*?"<>|\p{Cc}]/gu;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/;
// Windows reserves these with or without an extension.
const WINDOWS_RESERVED_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

const utf8 = new TextEncoder();

const byteLength = (value: string) => utf8.encode(value).length;

const truncateToBytes = (value: string, maxBytes: number): string => {
  let bytes = 0;
  let end = 0;
  for (const character of value) {
    bytes += byteLength(character);
    if (bytes > maxBytes) break;
    end += character.length;
  }
  return value.slice(0, end);
};

/**
 * Makes one researcher-authored name (an entity type's name) safe to embed in a
 * file name without otherwise changing it: any script, spaces and punctuation
 * survive.
 *
 * Removes only what a file system refuses (`/ \ : * ? " < > |` and control
 * characters) and the dots and spaces Windows strips from the end of a name,
 * and prefixes a name Windows reserves with an underscore. The result is in
 * NFC, so the same name typed on two keyboards is the same file name. It is
 * empty when nothing usable remains.
 */
export const sanitizeFilePart = (part: string): string => {
  const cleaned = toCanonicalText(
    part.replace(PATH_UNSAFE, '').replace(TRAILING_DOTS_AND_SPACES, ''),
  );
  return WINDOWS_RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned;
};

type FileNameRequest = {
  readonly prefix: string;
  readonly exportFormat: string;
  readonly extension: string;
  /** The entity type's name: the only record of what the file holds. */
  readonly entityName: string | undefined;
  /** The entity type's codebook id, which tells same-named files apart. */
  readonly entityId: string | undefined;
};

// Shrinks the entity name, and only if that is not enough the prefix, until the
// whole name fits. The format, the disambiguator and the extension never
// shrink: they are what keeps two files apart and openable.
const fitFileName = (
  { prefix, exportFormat, extension, entityName }: FileNameRequest,
  disambiguator: string,
) => {
  const formatPart =
    extension === `.${exportFormat}`
      ? ''
      : `${prefix ? '_' : ''}${exportFormat}`;
  const disambiguatorPart = disambiguator ? `_${disambiguator}` : '';
  const fixedBytes =
    byteLength(formatPart) +
    byteLength(disambiguatorPart) +
    byteLength(extension);

  const fittedPrefix = truncateToBytes(
    prefix,
    MAX_FILE_NAME_BYTES - fixedBytes,
  );
  const entity = entityName ? sanitizeFilePart(entityName) : '';
  const entityRoom =
    MAX_FILE_NAME_BYTES -
    fixedBytes -
    byteLength(fittedPrefix) -
    byteLength('_');
  const fittedEntity = truncateToBytes(entity, Math.max(entityRoom, 0)).replace(
    TRAILING_DOTS_AND_SPACES,
    '',
  );

  return {
    name: `${fittedPrefix}${formatPart}${fittedEntity ? `_${fittedEntity}` : ''}${disambiguatorPart}${extension}`,
    // A name that was given but cannot be read back from the file name.
    entityLost:
      Boolean(entityName) && (fittedEntity === '' || fittedEntity !== entity),
  };
};

const comparisonKey = normalizeForComparison;

/**
 * Names the files of one export so that no two are the same file on any file
 * system. The entity type's name is the only record of which type a CSV holds,
 * so it is kept as written wherever it can be.
 *
 * Names that are equal case-insensitively once sanitized, and names whose
 * entity part came out empty or was cut to fit, are told apart by the entity
 * type's codebook id: a suffix that depends on the type alone, so the same
 * type gets the same file name on every run. Only an exact repeat of a request
 * (the same session exported twice) falls back to a counter, in input order.
 */
export const assignFileNames = <Item>(
  items: readonly Item[],
  toRequest: (item: Item) => FileNameRequest,
): { item: Item; name: string }[] => {
  const fitted = items.map((item) => {
    const request = toRequest(item);
    return { item, request, ...fitFileName(request, '') };
  });

  const occurrences = new Map<string, number>();
  for (const { name } of fitted) {
    const key = comparisonKey(name);
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }

  const taken = new Set<string>();
  return fitted.map(({ item, request, name, entityLost }) => {
    const needsId =
      entityLost || (occurrences.get(comparisonKey(name)) ?? 0) > 1;
    const id =
      needsId && request.entityId ? sanitizeFilePart(request.entityId) : '';

    let candidate = id ? fitFileName(request, id).name : name;
    for (let counter = 2; taken.has(comparisonKey(candidate)); counter += 1) {
      candidate = fitFileName(
        request,
        [id, String(counter)].filter(Boolean).join('_'),
      ).name;
    }
    taken.add(comparisonKey(candidate));
    return { item, name: candidate };
  });
};
