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
   * The action slot is declared once, here, and the shell that calls it
   * re-exports that declaration.
   *
   * They were declared twice — the same three fields in the contract and in
   * `StageEditorShell.tsx` — which two identical structural types hide
   * completely: everything assigns to everything, so the copies could drift by
   * a field and nothing would say so until a host that had read one of them
   * was handed the other. Read out of the source, because that is exactly what
   * a type check cannot see.
   */
  it.each(['StageEditorActionContext', 'StageEditorActions'])(
    'is the only module that declares %s',
    (name) => {
      const shell = readFileSync(
        join(process.cwd(), 'src', 'form', 'StageEditorShell.tsx'),
        'utf8',
      );

      expect(
        shell,
        `StageEditorShell.tsx declares its own ${name}. There is one declaration, in stage-editor-contract.ts, and the shell re-exports it.`,
      ).not.toMatch(new RegExp(`export type ${name} =`));
      expect(shell).toMatch(
        /export type \{[^}]*\} from '\.\.\/stage-editor-contract\.ts';/,
      );
    },
  );
});
