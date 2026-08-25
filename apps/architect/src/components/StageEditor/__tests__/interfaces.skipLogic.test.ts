import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { INTERFACE_TYPES } from '~/components/Screens/NewStageScreen/interfaceOptions';

import { getInterface, interfaceHasSkipLogicSection } from '../Interfaces';

describe('SkipLogic section coverage', () => {
  it('gives Anonymisation the SkipLogic section', () => {
    // Anonymisation used to be the ONE interface without it, which made the
    // overwrite save silently delete a committed, schema-valid `skipLogic`
    // key the editor never showed. The maintainer chose the section over
    // tightening the schema; `withStageIdentity`'s carry-through remains as
    // the backstop for any interface that omits it, but Anonymisation itself
    // must render the real control.
    expect(interfaceHasSkipLogicSection('Anonymisation')).toBe(true);
  });

  it('every creatable interface renders SkipLogic, so the save backstop is dormant', () => {
    // Not a law of nature — a future interface may legitimately omit skip
    // logic, and the carry-through in StageEditor keeps its saved key intact.
    // This exists so that omission is a CONSCIOUS choice: whoever removes the
    // section from an interface must come here and exempt it, having read the
    // above.
    const missing = INTERFACE_TYPES.map(({ type }) => type).filter(
      (type) => !interfaceHasSkipLogicSection(type),
    );
    expect(missing).toEqual([]);
  });
});

/**
 * `withStageIdentity`'s `synthetic` carry has no gate, unlike the `skipLogic`
 * one above. That is sound only while nothing in the editor can author a
 * stage-level `synthetic` — the moment a section does, an absent key stops
 * meaning "no field could carry it" and starts meaning "the researcher cleared
 * it", and an ungated carry resurrects exactly what they removed.
 *
 * These two checks are the tripwire for the two ways that can happen.
 */
describe('stage-level synthetic authoring coverage', () => {
  it('no interface template seeds a synthetic block, so a fresh stage carries none', () => {
    // The other half of "unconditional costs nothing": the carry reads the
    // COMMITTED stage, which for a new stage is the interface template. A
    // template carrying the key would put generation parameters into every
    // stage created from scratch — and into the committed e2e stage snapshots,
    // which is how this would first be noticed if it were not caught here.
    const seeded = INTERFACE_TYPES.map(({ type }) => type).filter(
      (type) => getInterface(type).template.synthetic !== undefined,
    );
    expect(seeded).toEqual([]);
  });

  it('no stage-editor section registers a top-level synthetic field', () => {
    // Every field name in Architect's stage editor is a literal at its
    // registration site (`name="…"`, `name={'…'}`, `useField({ name: '…' })`),
    // so the source is the only complete inventory — the alternative, mounting
    // all twenty interfaces' section trees, needs a codebook, dialogs and a
    // protocol store per interface.
    //
    // Scoped to the EXACT name `synthetic`: `panels[N].synthetic` is a real
    // registration (NodePanels carries the panel-level block through a
    // hidden field) and must not trip this.
    const roots = [
      path.resolve(import.meta.dirname, '../../sections'),
      path.resolve(import.meta.dirname, '..'),
    ];
    const sourceFiles = roots.flatMap((root) =>
      readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            /\.tsx?$/.test(entry.name) &&
            !/\.(test|stories)\.tsx?$/.test(entry.name) &&
            !entry.parentPath.includes('__tests__'),
        )
        .map((entry) => path.join(entry.parentPath, entry.name)),
    );

    expect(sourceFiles.length).toBeGreaterThan(50);

    const registersSynthetic = /name(=\{?|:\s*)(['"`])synthetic\2/;
    const architectRoot = path.resolve(import.meta.dirname, '../../../..');
    const offenders = sourceFiles
      .filter((file) => registersSynthetic.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(architectRoot, file));

    // Not a law of nature: #1420 gives Architect a synthetic editor. Whoever
    // adds it must come here, and add the `interfaceHasSyntheticSection` gate
    // to `withStageIdentity` that this file's `skipLogic` twin already has.
    expect(offenders).toEqual([]);
  });
});
