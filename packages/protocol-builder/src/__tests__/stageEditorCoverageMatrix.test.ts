import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { composeStories } from '@storybook/react-vite';
import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import { censusAndBinStageEditors } from '../editors/censusAndBinStageEditors.ts';
import { formStageEditors } from '../editors/formStageEditors.ts';
import { nameGeneratorStageEditors } from '../editors/nameGeneratorStageEditors.ts';
import { networkStageEditors } from '../editors/networkStageEditors.ts';
import { pedigreeAndAnonymisationStageEditors } from '../editors/pedigreeAndAnonymisationStageEditors.ts';
import { isStageType, STAGE_TYPES } from '../stage-types.ts';
import {
  fixtureStageIds,
  loadFixtureStage,
} from '../testing/protocolFixture.ts';
import * as proofHostStories from '../testing/StudioProofHost.stories.tsx';
import { packageSource, sourcePath } from './packageSource.ts';

/**
 * The coverage matrix: for every interface in the schema, the four things
 * somebody has to have written, ASKED OF WHAT IS ON DISK rather than of a list
 * beside it.
 *
 * | Axis | Where it is read from |
 * | ---- | --------------------- |
 * | A story that opens the interface's editor for editing | every `StageEditor.stories.tsx` under `src/editors` |
 * | A story that opens the same editor as a spectator | the same file's exports |
 * | A Spanish locale sweep that renders it | every `*localeSweep.test.tsx` in the package |
 * | A proof-host scenario opening it, or its family | `src/testing/StudioProofHost.stories.tsx` |
 *
 * `src/__tests__/stageEditorCoverage.test.tsx` is the sibling that proves each
 * of the 19 editors DISPATCHES and MOUNTS. This one proves the surrounding
 * work exists for all of them — which is the half that rots, because a family
 * landing on its own branch has every incentive to write its editor and its
 * tests and leave the Storybook page, the sweep or the host proof for later.
 *
 * Read from the source tree rather than from a table, so the answer cannot be
 * kept up to date by editing this file: deleting a story, dropping a sweep
 * case or adding a stage type to the schema each fail here. The story files
 * are read as TEXT for the two story axes because those are an INVENTORY —
 * "does a page exist for this interface" — and the behaviour behind each page
 * is already asserted where it belongs: `test:storybook` runs every play in a
 * real browser, and the coverage sibling mounts every editor through the
 * dispatcher.
 */

/** Every editor family, by the name a reader of the registry would call it. */
const FAMILIES: Readonly<Record<string, Partial<Record<StageType, unknown>>>> =
  {
    censusAndBin: censusAndBinStageEditors,
    form: formStageEditors,
    nameGenerator: nameGeneratorStageEditors,
    network: networkStageEditors,
    pedigreeAndAnonymisation: pedigreeAndAnonymisationStageEditors,
  };

const familyClaiming = (stageType: StageType): string => {
  const family = Object.entries(FAMILIES).find(
    ([, part]) => part[stageType] !== undefined,
  );
  if (family === undefined) {
    throw new Error(`No family claims "${stageType}".`);
  }
  return family[0];
};

const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

/**
 * The stage a story or a sweep names, in the one form both write it.
 *
 * A regular expression rather than a parse, for the reason
 * `packageImportBoundaries.test.ts` gives about specifiers: what is guarded
 * here is a CLASS of omission, and reading the option every one of these files
 * already writes the same way is what keeps the reading honest. A file that
 * stopped writing it fails the count below rather than dropping out silently.
 */
const STAGE_ID = /stageId:\s*'([^']+)'/g;

/** A stage built rather than opened — `stage: { type: 'NameGenerator', … }`. */
const STAGE_TYPE_LITERAL = /\btype:\s*'(\w+)'/g;

/** The exported stories of a `*.stories.tsx`, by the name Storybook shows. */
const STORY_EXPORT = /^export const (\w+): Story\b/gm;

const captures = (contents: string, pattern: RegExp): string[] =>
  [...contents.matchAll(pattern)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

const FIXTURE_STAGE_IDS: ReadonlySet<string> = new Set(fixtureStageIds());

/** The interfaces a file names, however it names them. */
const stageTypesNamedIn = (contents: string): StageType[] => [
  ...captures(contents, STAGE_ID)
    .filter((stageId) => FIXTURE_STAGE_IDS.has(stageId))
    .map((stageId) => loadFixtureStage(stageId).type),
  ...captures(contents, STAGE_TYPE_LITERAL).filter(isStageType),
];

const EDITOR_STORY_FILE = /StageEditor\.stories\.tsx$/;

/** Every locale sweep, whichever family's directory it sits in. */
const LOCALE_SWEEP_FILE = /localeSweep\.test\.tsx$/i;

type EditorStoryFile = Readonly<{
  path: string;
  stageType: StageType;
  stories: readonly string[];
}>;

const editorStoryFiles = (): EditorStoryFile[] =>
  filesUnder(join(packageSource, 'editors'))
    .filter((path) => EDITOR_STORY_FILE.test(path))
    .map((path) => {
      const contents = readFileSync(path, 'utf8');
      const stageIds = captures(contents, STAGE_ID);
      // One stage per page, or this file cannot say which interface the page
      // is about — and a page opening two would make the axes below ambiguous
      // rather than merely incomplete.
      if (stageIds.length !== 1 || stageIds[0] === undefined) {
        throw new Error(
          `${sourcePath(path)} names ${stageIds.length} stages, so nothing here can say which interface its stories are about.`,
        );
      }
      return {
        path,
        stageType: loadFixtureStage(stageIds[0]).type,
        stories: captures(contents, STORY_EXPORT),
      };
    });

const localeSweepFiles = (): string[] =>
  filesUnder(packageSource).filter((path) => LOCALE_SWEEP_FILE.test(path));

/**
 * The interface each proof-host story opens, with the meta's default resolved.
 *
 * Composed rather than read off the module, because `composeStories` is what
 * merges a story's own args over the meta's: most of the twelve name no stage
 * at all and inherit the alter form, so the module's own exports would answer
 * `undefined` for them and this axis would be satisfied by whichever three
 * stories happened to override it.
 */
const proofHostStages = (): StageType[] =>
  Object.entries(composeStories(proofHostStories)).map(([name, story]) => {
    const { stageId } = story.args;
    if (stageId === undefined) {
      throw new Error(
        `The ${name} proof-host story opens no stage, so nothing here can say which family it proves.`,
      );
    }
    return loadFixtureStage(stageId).type;
  });

const sorted = (types: Iterable<StageType>): StageType[] =>
  [...new Set(types)].toSorted();

const EVERY_STAGE_TYPE = sorted(STAGE_TYPES);

describe('the stage editor coverage matrix', () => {
  /**
   * Every axis below is a file-system reading, so a runner whose working
   * directory has moved would find no story files, no sweeps, and report a
   * matrix full of holes — or, worse, find none of any axis and agree with
   * itself. Asserted first, and against landmarks each axis actually needs.
   */
  it('is looking at this package’s own source', () => {
    expect(existsSync(join(packageSource, 'stageEditorRegistry.ts'))).toBe(
      true,
    );
    expect(editorStoryFiles()).toHaveLength(STAGE_TYPES.length);
    expect(localeSweepFiles().length).toBeGreaterThan(0);
    expect(proofHostStages().length).toBeGreaterThan(0);
  });

  /**
   * One Storybook page per interface, and one for every interface.
   *
   * Both directions on purpose: a schema member with no page is an editor no
   * reviewer can open, and two pages claiming one interface would let the
   * axes below be satisfied by whichever of them was written first.
   */
  it('gives every interface a stage editor story file of its own', () => {
    expect(sorted(editorStoryFiles().map((file) => file.stageType))).toEqual(
      EVERY_STAGE_TYPE,
    );
  });

  /**
   * The editing story and the spectating one, for all 19.
   *
   * The spectating half is the one that goes missing: an editor is written
   * against the researcher who is editing it, and the story that opens it for
   * somebody holding no lease is the only page in the Storybook where a
   * reviewer — or `test:storybook`'s axe run — sees the read-only surface at
   * all. Four of the nineteen had no such page before this test existed.
   */
  it('opens each of them for editing and for spectating', () => {
    const missing = editorStoryFiles().flatMap(({ path, stageType, stories }) =>
      ['Editing', 'Spectating']
        .filter((story) => !stories.includes(story))
        .map(
          (story) =>
            `${stageType} (${sourcePath(path)}) exports no ${story} story`,
        ),
    );

    expect(missing).toEqual([]);
  });

  /**
   * A Spanish reader reaches every interface.
   *
   * The sweeps are the package's only negative localisation check — they ask
   * of a whole rendered surface whether anything on it is English a translator
   * has already answered for — so an interface no sweep renders is an
   * interface whose English can only be found by a reader. Which sweep covers
   * it does not matter, and deliberately so: the sweeps are grouped by family
   * and by section, and pinning an interface to a file would make moving a
   * case a failure.
   */
  it('renders every interface in a Spanish locale sweep', () => {
    const swept = localeSweepFiles().flatMap((path) =>
      stageTypesNamedIn(readFileSync(path, 'utf8')),
    );

    expect(EVERY_STAGE_TYPE.filter((type) => !swept.includes(type))).toEqual(
      [],
    );
  });

  /**
   * And each sweep really is Spanish.
   *
   * The axis above reads which stages a sweep names; this is what stops a file
   * satisfying it by naming them in English, where every descriptor renders
   * its own `defaultMessage` and the sweep can report nothing at all.
   */
  it('reads each of those sweeps in es', () => {
    const notSpanish = localeSweepFiles().filter(
      (path) => !readFileSync(path, 'utf8').includes("locale: 'es'"),
    );

    expect(notSpanish.map(sourcePath)).toEqual([]);
  });

  /**
   * The proof host opens an editor from every family.
   *
   * By family rather than by interface, because that is what #1493 asked for
   * and what the host is proving: the host contract is the same for all 19,
   * and what differs between families is the shape of the editing — a census's
   * prompt rows, a canvas's presets, a pedigree's compound edits. A family
   * with no scenario is a shape of editing nothing has driven through a
   * Redux-free host.
   *
   * Read out of the registry parts rather than from a list of five names, so a
   * sixth family arriving with no proof-host story fails here.
   */
  it('opens an editor from every family in the Studio proof host', () => {
    const opened = proofHostStages().map(familyClaiming);

    expect([...new Set(opened)].toSorted()).toEqual(
      Object.keys(FAMILIES).toSorted(),
    );
  });
});
