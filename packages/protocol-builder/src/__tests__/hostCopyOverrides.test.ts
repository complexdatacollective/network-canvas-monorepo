import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NOT_CONVERTED_YET,
  packageSource,
  sourceFiles,
  sourcePath,
} from './packageSource.ts';

/**
 * A bundle of words a caller may hand in: `…Copy`, `…Confirm`, `…Words`.
 *
 * Matched by NAME rather than by shape, because the shape is what is being
 * judged. The three suffixes are the ones this package has reached for; a new
 * synonym is a new entry here, and the prop rule below catches the case where
 * somebody skips the bundle altogether.
 */
const BUNDLE_NAME = /(?:Copy|Confirm|Words)$/;

const DECLARATION = /(?:^|\n)\s*(?:export\s+)?(type|interface)\s+(\w+)/g;

/**
 * The body of one type alias or interface, read by BALANCING braces rather
 * than by stopping at the first `;` that ends a line.
 *
 * That shortcut is what the previous scan did (`([\s\S]*?);\n`), and every
 * bundle in this package is written across several lines: the match stopped at
 * the first member, so a descriptor on line one cleared the whole type and
 * every `string` after it was never looked at. Reading to the real end of the
 * declaration is the whole point of this function.
 */
const declarationBody = (
  contents: string,
  kind: string,
  from: number,
): string | null => {
  let index = from;
  if (kind === 'type') {
    while (index < contents.length && contents[index] !== '=') {
      // A generic parameter list can hold anything but `=`, and a declaration
      // without one reaches the `=` immediately.
      if (contents[index] === ';' || contents[index] === '\n') {
        if (contents[index] === ';') return null;
      }
      index += 1;
    }
    index += 1;
  } else {
    while (index < contents.length && contents[index] !== '{') index += 1;
  }

  let depth = 0;
  const start = index;
  for (; index < contents.length; index += 1) {
    const character = contents[index];
    if (character === '{' || character === '(' || character === '[') depth += 1;
    else if (character === '}' || character === ')' || character === ']') {
      depth -= 1;
      // An interface ends AT its closing brace; a type alias runs on to `;`.
      if (depth === 0 && kind === 'interface') {
        return contents.slice(start, index + 1);
      }
    } else if (character === ';' && depth === 0 && kind === 'type') {
      return contents.slice(start, index);
    }
  }
  return contents.slice(start);
};

type Declaration = Readonly<{ file: string; name: string; body: string }>;

const declarationsIn = (path: string): Declaration[] => {
  const contents = readFileSync(path, 'utf8');
  const found: Declaration[] = [];
  for (const match of contents.matchAll(DECLARATION)) {
    const [, kind = '', name = ''] = match;
    const body = declarationBody(
      contents,
      kind,
      (match.index ?? 0) + match[0].length,
    );
    if (body === null) continue;
    found.push({ file: sourcePath(path), name, body });
  }
  return found;
};

/**
 * A member of this bundle is a plain string rather than a message.
 *
 * `: string` and `: React.ReactNode` are both holes: extraction never sees
 * either, so neither reaches `src/locales/en.json`, the catalog guards or a
 * translator. A string LITERAL type (`kind: 'authored'`) is not a hole — it is
 * a discriminant, never read by anyone — so the check is anchored to the two
 * words themselves.
 */
const PLAIN_WORDS = /:\s*(?:readonly\s+)?(?:string|(?:React\.)?ReactNode)\b/;

const bundleOffends = (declaration: Declaration) =>
  BUNDLE_NAME.test(declaration.name) && PLAIN_WORDS.test(declaration.body);

/**
 * A prop that hands a component its words as a hole a host drops English into.
 *
 * Named by every name the seam has been given, because renaming it is the
 * cheapest way to bring it back: `copy`, and the synonyms an author reaches
 * for when `copy` is taken. What is judged is the TYPE, not the name — a prop
 * typed with a named `…Copy` bundle is the bundle rule's to judge, wherever
 * that bundle is declared, and a prop naming one that holds descriptors is not
 * a hole at all. This is what catches the two shapes that rule cannot see: a
 * bundle written INLINE on the prop, and words handed over as bare `string`s.
 */
const COPY_PROP =
  /^\s*(?:copy|copyOverrides|overrides|words|labels|wording)\??\s*:([^\n;]*)/gm;

const copyPropOffenders = (contents: string): string[] =>
  [...contents.matchAll(COPY_PROP)].flatMap((match) => {
    const declared = match[1] ?? '';
    return PLAIN_WORDS.test(`:${declared}`) || declared.includes('{')
      ? [match[0].trim()]
      : [];
  });

describe('host copy overrides', () => {
  it('is looking at this package’s own source', () => {
    expect(existsSync(join(packageSource, 'protocol-context.ts'))).toBe(true);
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it('declares no copy prop anywhere in the package', () => {
    const offenders = sourceFiles().flatMap((path) =>
      copyPropOffenders(readFileSync(path, 'utf8')).map(
        (declaration) => `${sourcePath(path)} — ${declaration}`,
      ),
    );

    expect(offenders).toEqual([]);
  });

  /**
   * And it still refuses the shapes it was written for, including the two
   * renames the old name-only rule waved through.
   */
  it('refuses a copy prop under any of its names', () => {
    const verdicts = [
      '  copy?: Partial<XCopy>;\n',
      '  copyOverrides?: { title: string };\n',
      '  words?: Readonly<{ title: string }>;\n',
      '  labels?: string;\n',
      '  words: SubjectWords;\n',
      '  copy?: Partial<ConvertedCopy>;\n',
    ].map((declaration) => copyPropOffenders(declaration).length > 0);

    // The last two name a bundle rather than inlining one, which is the
    // bundle rule's question and not this one's.
    expect(verdicts).toEqual([false, true, true, true, false, false]);
  });

  it('carries message descriptors in every copy bundle it keeps', () => {
    const offenders = sourceFiles()
      .flatMap(declarationsIn)
      .filter(bundleOffends)
      .map(
        (declaration) =>
          `${declaration.file} — ${declaration.name} holds a plain string`,
      );

    expect(offenders).toEqual([]);
  });

  /**
   * The scan can SEE the two shapes the old one could not.
   *
   * Written against this file's own parser rather than against a fixture on
   * disk, because what is being held in place is the reading: a multi-line
   * bundle judged on its first member, and a bundle written as an interface,
   * are the two ways the previous regex was blind, and both of them look
   * exactly like a converted bundle from the outside.
   */
  it('reads a whole bundle, however it is written', () => {
    const multiLine = [
      'export type XCopy = Readonly<{',
      '  title: MessageDescriptor;',
      '  description: string;',
      '}>;',
      '',
    ].join('\n');
    const asInterface = 'export interface XCopy {\n  title: string;\n}\n';
    const converted = [
      'export type XCopy = Readonly<{',
      '  title: MessageDescriptor;',
      '  description: MessageDescriptor;',
      '}>;',
      '',
    ].join('\n');
    const discriminated = [
      "type XCopy = Readonly<{ kind: 'authored'; sentence: MessageDescriptor }>;",
      '',
    ].join('\n');

    const verdicts = [multiLine, asInterface, converted, discriminated].map(
      (contents) => {
        const match = DECLARATION.exec(contents);
        DECLARATION.lastIndex = 0;
        const [, kind = '', name = ''] = match ?? [];
        const body =
          declarationBody(
            contents,
            kind,
            (match?.index ?? 0) + (match?.[0].length ?? 0),
          ) ?? '';
        return bundleOffends({ file: 'fixture.ts', name, body });
      },
    );

    expect(verdicts).toEqual([true, true, false, false]);
  });
});

describe('the not-yet-converted exclusions', () => {
  /**
   * An exclusion is a claim that a directory still holds an offender. When it
   * stops being true the exclusion has outlived its conversion, and nothing
   * else in this file would ever say so: excluding a clean directory silently
   * widens the blind spot for everything added to it afterwards.
   */
  it('covers only directories that still hold something to excuse', () => {
    const present = NOT_CONVERTED_YET.filter((directory) =>
      existsSync(join(packageSource, directory)),
    );

    const stale = present.filter((directory) => {
      const files = sourceFiles(join(packageSource, directory), {
        excluding: [],
      });
      return !files.some(
        (path) =>
          copyPropOffenders(readFileSync(path, 'utf8')).length > 0 ||
          declarationsIn(path).some(bundleOffends),
      );
    });

    expect(stale).toEqual([]);
  });

  /**
   * And every one of them is a directory that is actually here.
   *
   * An exclusion naming a path this package does not have excuses nothing, and
   * the check above cannot see it: `present` filters it out before asking
   * whether anything is left to excuse. Family F's five section directories
   * were carried on this list for exactly that reason — they lived on another
   * branch — and this is what stops a name outliving the merge that brought
   * its directory in.
   */
  it('names only directories that are here to exclude', () => {
    const absent = NOT_CONVERTED_YET.filter(
      (directory) => !existsSync(join(packageSource, directory)),
    );

    expect(absent).toEqual([]);
  });

  /**
   * The interface families that ARE here are inside the scan, not merely
   * un-excluded.
   *
   * Deleting a name from `NOT_CONVERTED_YET` is not by itself proof the rules
   * reach that directory: `sourceFiles` also drops fixtures and test-support
   * paths, so a family whose sections were all `__tests__`-adjacent would read
   * as converted while nothing looked at it. Asked of the families present
   * rather than of all five, because they arrive one branch at a time — the
   * ones that have landed are covered, and the ones that have not cannot be
   * claimed either way.
   */
  it('reaches every interface family that is here', () => {
    const families = [
      'sections/network',
      'sections/pedigree',
      'sections/narrativePedigree',
      'sections/geospatial',
      'sections/anonymisation',
    ];
    const present = families.filter((directory) =>
      existsSync(join(packageSource, directory)),
    );
    const scanned = sourceFiles().map(sourcePath);

    const covered = present.filter((directory) =>
      scanned.some((path) => path.startsWith(`${directory}/`)),
    );

    expect(covered).toEqual(present);
  });

  /**
   * And `resources/` — the last name this list carried — is inside the scan.
   *
   * The two checks above are dormant while the list is empty: filtering an
   * empty list yields an empty list whatever the package looks like, so
   * neither of them can fail today. This is the one that says what emptying
   * the list CLAIMED, and it fails the moment anybody re-excludes the
   * directory rather than fixing what made them want to.
   */
  it('reaches the resources directory the list used to excuse', () => {
    const scanned = sourceFiles().map(sourcePath);

    expect(scanned.some((path) => path.startsWith('resources/'))).toBe(true);
  });
});
