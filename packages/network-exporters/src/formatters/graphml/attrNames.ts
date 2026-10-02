// The characters XML 1.0 (5th edition) allows in a Name, production [4a]
// NameChar: https://www.w3.org/TR/xml/#NT-NameChar. GraphML types `attr.name`
// as an xs:NMTOKEN, which is any run of them, so every Unicode letter is valid
// and spaces and most punctuation are not.
const NAME_CHARACTERS = [
  ':A-Z_a-z\\-.0-9',
  '\\u00B7',
  '\\u00C0-\\u00D6',
  '\\u00D8-\\u00F6',
  '\\u00F8-\\u037D',
  '\\u037F-\\u1FFF',
  '\\u200C-\\u200D',
  '\\u203F-\\u2040',
  '\\u2070-\\u218F',
  '\\u2C00-\\u2FEF',
  '\\u3001-\\uD7FF',
  '\\uF900-\\uFDCF',
  '\\uFDF0-\\uFFFD',
  '\\u{10000}-\\u{EFFFF}',
].join('');

const NOT_A_NAME_CHARACTER = new RegExp(`[^${NAME_CHARACTERS}]`, 'gu');

type AttrNameTarget = 'graph' | 'node' | 'edge' | 'all';

type AttrNameKey = {
  readonly name: string;
  readonly target: AttrNameTarget;
  /** Keys the export always declares, which keep their names. */
  readonly builtIn: boolean;
};

/**
 * A valid NMTOKEN for `name`: every NameChar kept, every other character
 * (a space, `(`, `/`, ...) replaced by `_`. A name that is already a valid
 * NMTOKEN is returned unchanged.
 */
export const deriveAttrName = (name: string): string =>
  name.replace(NOT_A_NAME_CHARACTER, '_');

const overlaps = (a: AttrNameTarget, b: AttrNameTarget) =>
  a === 'all' || b === 'all' || a === b;

/**
 * The `attr.name` to write for each key.
 *
 * Two names that differ only in characters `deriveAttrName` replaces (`a b`
 * and `a?b`) derive the same `attr.name`, and so does a variable named `label`
 * beside the `label` key every export declares. Keys whose domains overlap must
 * not share an `attr.name`, so a clash is settled in a fixed order:
 *
 * 1. a key whose name is already a valid NMTOKEN keeps it, unless a built-in
 *    key has it;
 * 2. every other key takes its derived name, or that name followed by `_2`,
 *    `_3`, ... in the order the keys are given, when an overlapping key has it.
 *
 * Keys with the very same name share one `attr.name`, as they always have: the
 * same variable name on two node types never meets on one node.
 */
export const resolveAttrNames = <Key extends AttrNameKey>(
  keys: readonly Key[],
): Map<Key, string> => {
  const resolved = new Map<Key, string>();
  const claims = new Map<string, Set<AttrNameTarget>>();

  const isFree = (attrName: string, target: AttrNameTarget) =>
    [...(claims.get(attrName) ?? [])].every(
      (claimed) => !overlaps(claimed, target),
    );
  const claim = (key: Key, attrName: string) => {
    resolved.set(key, attrName);
    const targets = claims.get(attrName);
    if (targets) {
      targets.add(key.target);
    } else {
      claims.set(attrName, new Set([key.target]));
    }
  };

  const builtIns = keys.filter(({ builtIn }) => builtIn);
  for (const key of builtIns) {
    claim(key, key.name);
  }

  const deferred: Key[] = [];
  for (const key of keys.filter(({ builtIn }) => !builtIn)) {
    const clashesWithBuiltIn = builtIns.some(
      (builtIn) =>
        builtIn.name === key.name && overlaps(builtIn.target, key.target),
    );
    if (deriveAttrName(key.name) === key.name && !clashesWithBuiltIn) {
      claim(key, key.name);
    } else {
      deferred.push(key);
    }
  }

  const assigned = new Map<string, string>();
  for (const key of deferred) {
    let attrName = assigned.get(key.name);
    if (attrName === undefined) {
      const derived = deriveAttrName(key.name);
      attrName = derived;
      for (let suffix = 2; !isFree(attrName, key.target); suffix += 1) {
        attrName = `${derived}_${suffix}`;
      }
      assigned.set(key.name, attrName);
    }
    claim(key, attrName);
  }
  return resolved;
};
