import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import { stageEditorRegistry } from '../../stageEditorRegistry.ts';
import {
  fixtureStageIds,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { NetworkComposerStageEditor } from '../network/NetworkComposerStageEditor.tsx';
import { SociogramStageEditor } from '../network/SociogramStageEditor.tsx';
import { shimMarkdownEditorMeasurement } from '../pedigree/__tests__/editorFixtures.tsx';
import { FamilyPedigreeStageEditor } from '../pedigree/FamilyPedigreeStageEditor.tsx';
import { NarrativePedigreeStageEditor } from '../pedigree/NarrativePedigreeStageEditor.tsx';

shimMarkdownEditorMeasurement();

/**
 * The interfaces these two families claim between them, and — for each — the
 * outline sections only that editor composes.
 *
 * The section names are the discriminator because they are what a researcher
 * would see: opening a sociogram in the network composer editor is not a type
 * error, it is a page with the wrong things on it. Sociogram is named by two,
 * because the rest of its own family shares almost everything with it; the
 * check below
 * refuses a discriminator that does not in fact discriminate, so a lazy one
 * here fails rather than passing vacuously.
 */
const CLAIMED = [
  {
    stageType: 'FamilyPedigree',
    editor: FamilyPedigreeStageEditor,
    sections: ['Pedigree framing'],
  },
  {
    stageType: 'NarrativePedigree',
    editor: NarrativePedigreeStageEditor,
    sections: ['Pedigree source'],
  },
  {
    stageType: 'NetworkComposer',
    editor: NetworkComposerStageEditor,
    sections: ['Adding and arranging nodes'],
  },
  {
    stageType: 'Sociogram',
    editor: SociogramStageEditor,
    sections: ['Prompts', 'Node layout'],
  },
] as const satisfies readonly {
  stageType: StageType;
  editor: unknown;
  sections: readonly string[];
}[];

/**
 * The fixture stage of a given interface, found by its type.
 *
 * By type rather than by a stage id spelled here, so this test cannot drift
 * from the protocol it opens: a fixture that renamed a stage would still be
 * found, and one that dropped an interface fails with the interface named
 * rather than with an id nobody recognises.
 */
function fixtureStageOfType(stageType: StageType): string {
  const stageId = fixtureStageIds().find(
    (candidate) => loadFixtureStage(candidate).type === stageType,
  );
  if (stageId === undefined) {
    throw new Error(
      `The all-interfaces protocol has no "${stageType}" stage, so nothing here can open one.`,
    );
  }
  return stageId;
}

describe('the interfaces the network, spatial and pedigree families claim', () => {
  /**
   * By identity, against the registry the package actually composes — not
   * against either family's own part. A part that is written correctly but
   * never reaches `REGISTRY_PARTS` leaves every stage it claims opening on
   * `UnregisteredStageTypeError`, and a part test would go on passing.
   */
  it.each(CLAIMED)(
    'composes the $stageType editor into the package registry',
    ({ stageType, editor }) => {
      expect(stageEditorRegistry[stageType]).toBe(editor);
    },
  );

  // That none of these is still on `AWAITING_STAGE_EDITORS` is not asserted
  // here: the list is declared `satisfies readonly UnregisteredStageType[]`,
  // so a claimed interface left on it does not compile, and a runtime check
  // of the same fact is one the compiler rejects as impossible.

  /**
   * End to end, through the package's own dispatcher: no registry is passed,
   * so `StageEditor` reaches for `stageEditorRegistry`, and each stage of the
   * shared protocol has to open on the sections its own family composes.
   *
   * One test rather than one per interface, because the claim is comparative
   * — each discriminator has to name exactly ONE of these editors, which
   * cannot be asserted from inside a single render.
   */
  it('opens each of them on its own editor', () => {
    const outlines = new Map<StageType, Set<string>>();
    for (const { stageType } of CLAIMED) {
      const harness = renderStageEditor({
        stageId: fixtureStageOfType(stageType),
      });
      outlines.set(
        stageType,
        new Set(harness.outline().map((section) => section.title)),
      );
      // Where this stage sits in the interview it is part of. Read here
      // because each editor's own create-mode test asserts this line is
      // ABSENT for a stage the interview does not contain yet, and an absence
      // is worth nothing until something has seen the presence.
      expect(
        harness.getByText(/^Stage \d+ of \d+$/),
        `${stageType} does not say where it sits in the interview`,
      ).toBeInTheDocument();
      harness.unmount();
    }

    // Non-vacuous: every editor rendered sections at all, so an editor that
    // silently rendered nothing cannot pass the containment checks below by
    // having nothing to contradict them.
    for (const [stageType, titles] of outlines) {
      expect(
        titles.size,
        `${stageType} opened on an empty editor`,
      ).toBeGreaterThan(1);
    }

    for (const { stageType, sections } of CLAIMED) {
      const matching = [...outlines]
        .filter(([, titles]) => sections.every((title) => titles.has(title)))
        .map(([type]) => type);
      expect(
        matching,
        `${sections.join(' + ')} was expected to name the ${stageType} editor and nothing else.`,
      ).toEqual([stageType]);
    }
  });
});
