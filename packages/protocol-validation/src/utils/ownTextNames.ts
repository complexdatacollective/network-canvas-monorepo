import { dynamicValueNamesIn } from '../localization/dynamicValueMessages.ts';
import { dynamicAttributesShownBy } from '../schemas/9/dynamic-attributes.ts';
import {
  dynamicValueNameFor,
  parseDynamicValueName,
} from '../schemas/9/dynamic-value-names.ts';
import { isOwnTextOf, type TextPlace } from './textPlace.ts';

type TextHit = Readonly<{
  place: TextPlace;
  value: Readonly<Record<string, string>>;
}>;

/**
 * The value names that the text of the owner at `owner` uses, in any
 * language: every one of its localized strings (`hits`, as
 * `collectLocalizedStrings` finds them) except the wording of its own dynamic
 * attributes (`isOwnTextOf`), and the dynamic attributes of `dynamicAttributes`
 * (the owner's) that the wording of those it names shows, directly or through
 * others (`dynamicAttributesShownBy`). What counts a dynamic attribute as used, both
 * for the check that refuses an unused one and for the save that leaves one
 * out.
 */
export const ownTextNames = (
  hits: readonly TextHit[],
  owner: readonly (string | number)[],
  dynamicAttributes: Readonly<Record<string, unknown>> = {},
): Set<string> => {
  const names = new Set<string>();
  for (const hit of hits) {
    if (!isOwnTextOf(hit.place, owner)) continue;
    for (const message of Object.values(hit.value)) {
      for (const name of dynamicValueNamesIn(message)) names.add(name);
    }
  }
  // A dynamic attribute that the wording of one the text shows shows is
  // shown too, through it.
  for (const name of names) {
    const parsed = parseDynamicValueName(name);
    if (parsed?.kind !== 'dynamicAttribute') continue;
    for (const id of dynamicAttributesShownBy(parsed.id, dynamicAttributes)) {
      names.add(dynamicValueNameFor({ kind: 'dynamicAttribute', id }));
    }
  }
  return names;
};
