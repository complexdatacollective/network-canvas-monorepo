import { dynamicValueNamesIn } from '../localization/dynamicValueMessages.ts';
import { isOwnTextOf, type TextPlace } from './textPlace.ts';

type TextHit = Readonly<{
  place: TextPlace;
  value: Readonly<Record<string, string>>;
}>;

/**
 * The value names that the text of the owner at `owner` uses, in any
 * language: every one of its localized strings (`hits`, as
 * `collectLocalizedStrings` finds them) except the wording of its own dynamic
 * attributes (`isOwnTextOf`). What counts a dynamic attribute as used, both
 * for the check that refuses an unused one and for the save that leaves one
 * out.
 */
export const ownTextNames = (
  hits: readonly TextHit[],
  owner: readonly (string | number)[],
): Set<string> => {
  const names = new Set<string>();
  for (const hit of hits) {
    if (!isOwnTextOf(hit.place, owner)) continue;
    for (const message of Object.values(hit.value)) {
      for (const name of dynamicValueNamesIn(message)) names.add(name);
    }
  }
  return names;
};
