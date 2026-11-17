import { describe, expect, it } from 'vitest';

import { SECTION_KEYS } from '@codaco/protocol-builder/sections/sectionKeys';
import { getInterfaceTypes } from '~/components/Screens/NewStageScreen/interfaceOptions';

import {
  hasWalkthrough,
  loadWalkthrough,
  type Walkthrough,
} from '../parseWalkthrough';
import { SCENE_NAMES } from '../scenes/sceneRegistry';
import { CONTROLS, lexWalkthrough } from '../walkthroughFormat';

// Every walkthrough the app ships, loaded through the app's own loader, so a
// file that would fail to load (a format error, an include of a shared file
// that does not exist) fails here instead.

const contentFile = /^\.\.\/content\/(.+)\.md$/;
const stageTypes = Object.keys(import.meta.glob('../content/*.md')).map(
  (path) => contentFile.exec(path)?.[1] ?? path,
);
const sharedSources = import.meta.glob<string>('../content/shared/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const loadAll = async () =>
  new Map<string, Walkthrough>(
    await Promise.all(
      stageTypes.map(async (type): Promise<[string, Walkthrough]> => {
        const walkthrough = await loadWalkthrough(type);
        if (walkthrough === undefined) throw new Error(`No ${type}`);
        return [type, walkthrough];
      }),
    ),
  );

describe('walkthrough content', () => {
  it('finds the content files and scene names', () => {
    expect(stageTypes.length).toBeGreaterThan(0);
    expect(SCENE_NAMES.length).toBeGreaterThan(0);
  });

  it('names every content file after a stage type', () => {
    const known = getInterfaceTypes().map(({ type }) => type as string);
    expect(stageTypes.filter((type) => !known.includes(type))).toEqual([]);
  });

  it('reports a walkthrough for each content file and no other', () => {
    for (const type of stageTypes) expect(hasWalkthrough(type)).toBe(true);
    expect(hasWalkthrough('NotAStageType')).toBe(false);
  });

  it.each(stageTypes)(
    '%s loads, with a title and at least one step',
    async (type) => {
      const walkthrough = await loadWalkthrough(type);
      expect(walkthrough?.title).toBeTruthy();
      expect(walkthrough?.steps.length).toBeGreaterThan(0);
      for (const step of walkthrough?.steps ?? []) {
        expect(step.title, `a step in ${type}`).toBeTruthy();
      }
    },
  );

  it.each(Object.keys(sharedSources))('%s reads', (path) => {
    expect(() => lexWalkthrough(sharedSources[path] ?? '')).not.toThrow();
  });

  it('names only registered scenes', async () => {
    const unknown = [...(await loadAll())].flatMap(([type, { steps }]) =>
      steps.flatMap((step) =>
        step.scene !== undefined && !SCENE_NAMES.includes(step.scene)
          ? [`${type}: "${step.title}" plays "${step.scene}"`]
          : [],
      ),
    );
    expect(unknown).toEqual([]);
  });

  it('plays every registered scene somewhere', async () => {
    const played = new Set(
      [...(await loadAll()).values()].flatMap(({ steps }) =>
        steps.flatMap((step) => (step.scene === undefined ? [] : [step.scene])),
      ),
    );
    expect(SCENE_NAMES.filter((name) => !played.has(name))).toEqual([]);
  });

  it('names only known controls', async () => {
    const known: readonly string[] = CONTROLS;
    const unknown = [...(await loadAll())].flatMap(([type, { steps }]) =>
      steps.flatMap((step) =>
        step.control !== undefined && !known.includes(step.control)
          ? [`${type}: "${step.title}" rings "${step.control}"`]
          : [],
      ),
    );
    expect(unknown).toEqual([]);
  });

  // Sections are named by their stable keys ("skip-logic"), never by their
  // titles, which are translated and reworded.
  it('names only known section keys', async () => {
    const known: readonly string[] = SECTION_KEYS;
    const unknown = [...(await loadAll())].flatMap(([type, { steps }]) =>
      steps.flatMap((step) =>
        step.section !== undefined && !known.includes(step.section)
          ? [`${type}: "${step.title}" names section "${step.section}"`]
          : [],
      ),
    );
    expect(unknown).toEqual([]);
  });
});
