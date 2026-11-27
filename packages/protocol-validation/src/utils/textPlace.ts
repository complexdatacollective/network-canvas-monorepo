import { ownerOfTextPath, type TextOwnerPath } from './textOwners.ts';

type Path = readonly (string | number)[];

/**
 * The owner of a text, as a place names it: where the owner sits in the
 * protocol (`TextOwnerPath`), or `[]` for a path that starts at the owner
 * itself (a stage, or a node type's label, read on its own).
 */
type PlaceOwner = TextOwnerPath | readonly [];

/**
 * What a translatable string is, by where it sits in a protocol. Every
 * reader that needs to know whether a string is a form's text, a form
 * field's question or hint, or a version of a dynamic attribute asks
 * `textPlaceOf` rather than reading the segments of its path.
 *
 * - `formContent`: the text of a form (`…form.content`), which places the
 *   form's fields as blocks; `form` is the path of the form.
 * - `formFieldText`: the question (`prompt`) or the hint of the field at
 *   `index` of the form at `form` (`…form.fields.<index>.prompt|hint`).
 * - `dynamicAttributeWording`: the wording of a version of the dynamic
 *   attribute `id` of the owner (`<owner>.dynamicAttributes.<id>.<version>`);
 *   `version` is the path of the wording in the dynamic attribute, such as
 *   `['cases', 0, 'wording']`, `['otherwise']` or, for a number, the one
 *   plural message `['wording']` (see `dynamicAttributeVersions`).
 * - `text`: any other string. `owner` is undefined for a string that no
 *   owner's conditions or dynamic attributes can reach, such as an option's
 *   label.
 */
export type TextPlace =
  | Readonly<{ kind: 'formContent'; owner: PlaceOwner; form: Path }>
  | Readonly<{
      kind: 'formFieldText';
      owner: PlaceOwner;
      form: Path;
      index: number;
      text: 'prompt' | 'hint';
    }>
  | Readonly<{
      kind: 'dynamicAttributeWording';
      owner: PlaceOwner;
      id: string;
      version: Path;
    }>
  | Readonly<{ kind: 'text'; owner: PlaceOwner | undefined }>;

/**
 * Where a path starts: at the protocol's root (`protocol`), or at the owner
 * of the text (`owner`), as for the strings of one stage read with the
 * stage's own schema.
 */
export type TextRoot = 'protocol' | 'owner';

const OWNER_ITSELF: readonly [] = [];

/**
 * The place of the string at `path` (see `TextPlace`). `root` says where
 * `path` starts: by default at the protocol's root, where the owner is
 * found from the path (`ownerOfTextPath`).
 */
export const textPlaceOf = (
  path: Path,
  root: TextRoot = 'protocol',
): TextPlace => {
  const owner = root === 'owner' ? OWNER_ITSELF : ownerOfTextPath(path);
  if (owner === undefined) return { kind: 'text', owner };
  const within = path.slice(owner.length);

  const [first, id, ...version] = within;
  if (first === 'dynamicAttributes' && typeof id === 'string') {
    return version.length > 0
      ? { kind: 'dynamicAttributeWording', owner, id, version }
      : { kind: 'text', owner };
  }

  const last = within.at(-1);
  if (last === 'content' && within.at(-2) === 'form') {
    return { kind: 'formContent', owner, form: path.slice(0, -1) };
  }
  const index = within.at(-2);
  if (
    (last === 'prompt' || last === 'hint') &&
    typeof index === 'number' &&
    within.at(-3) === 'fields' &&
    within.at(-4) === 'form'
  ) {
    return {
      kind: 'formFieldText',
      owner,
      form: path.slice(0, -3),
      index,
      text: last,
    };
  }
  return { kind: 'text', owner };
};

/**
 * Whether the string at `place` is one of the owner's own texts: a text of
 * the owner at `owner`, and not the wording of one of its dynamic
 * attributes. What shows a dynamic attribute or names a condition.
 */
export const isOwnTextOf = (place: TextPlace, owner: Path): boolean =>
  place.kind !== 'dynamicAttributeWording' &&
  place.owner !== undefined &&
  place.owner.length === owner.length &&
  place.owner.every((part, index) => part === owner[index]);
