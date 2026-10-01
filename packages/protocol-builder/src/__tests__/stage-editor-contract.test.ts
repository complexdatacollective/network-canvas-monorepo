import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingStageEditors, STAGE_TYPES } from '../stage-editor-contract.ts';

describe('stage editor contract', () => {
  it('tracks every current schema stage type', () => {
    expect(STAGE_TYPES.length).toBeGreaterThan(0);
    expect(new Set(STAGE_TYPES).size).toBe(STAGE_TYPES.length);
    expect(missingStageEditors({})).toEqual(STAGE_TYPES);
  });

  /**
   * The action slot is declared once, in the contract, and the shell that
   * calls it re-exports `StageEditorActions` from there instead of declaring
   * its own.
   *
   * They were declared twice — the same three fields in the contract and in
   * `StageEditorShell.tsx` — which two identical structural types hide
   * completely: everything assigns to everything, so the copies could drift by
   * a field and nothing would say so until a host that had read one of them
   * was handed the other. Read out of the source, because that is exactly what
   * a type check cannot see. (`StageEditorActionContext` is reached through
   * the contract only; the shell has no reason to carry it on.)
   */
  const readSource = (...segments: string[]) =>
    readFileSync(join(process.cwd(), 'src', ...segments), 'utf8');

  it.each(['StageEditorActionContext', 'StageEditorActions'])(
    'is the only module that declares %s',
    (name) => {
      const declaration = new RegExp(
        `\\b(?:type|interface)\\s+${name}\\b\\s*[=<{]`,
      );

      expect(readSource('stage-editor-contract.ts')).toMatch(declaration);
      expect(
        readSource('form', 'StageEditorShell.tsx'),
        `StageEditorShell.tsx declares its own ${name}. There is one declaration, in stage-editor-contract.ts.`,
      ).not.toMatch(declaration);
    },
  );

  it('re-exports StageEditorActions from the contract in the shell', () => {
    expect(readSource('form', 'StageEditorShell.tsx')).toMatch(
      /export type \{[^}]*\bStageEditorActions\b[^}]*\} from '\.\.\/stage-editor-contract\.ts';/,
    );
  });
});
