import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HOST_RESPONSIBILITIES,
  HOST_RESPONSIBILITY_CALLS,
} from '@codaco/protocol-builder/testing/hostResponsibilities';

/**
 * Which of `@codaco/protocol-builder`'s six host responsibilities this
 * adapter discharges today.
 *
 * The package's proof host discharges all six and says so, and that sentence
 * used to end "every one of them is a call `useStudioStageSession.ts` already
 * makes for real" — which was true of four. This is what stops the corrected
 * sentence rotting in the other direction: when Studio's transport grows a
 * compound-edit or a resource path and this adapter wires it, this test fails
 * and the claim in `src/testing/hostResponsibilities.ts` has to be rewritten
 * before it can pass.
 *
 * Read out of the adapter's source rather than by constructing a session,
 * because what is being asked is which OPTIONS this file passes and which
 * METHODS it calls, and both are gone by the time a store exists.
 */
const adapterPath = join(process.cwd(), 'src/editor/useStudioStageSession.ts');

/**
 * The source without its whole-line comments.
 *
 * `onCompoundEdit` is named in a comment beside `onCommands` — explaining why
 * a compound edit would have to go through the same commit queue — so a plain
 * text search reports the very responsibility this file does not discharge as
 * discharged. Whole-line comments only: this file's comments are all written
 * that way, and stripping mid-line would take `//` out of any URL or string
 * beside it.
 */
const adapterCode = (): string =>
  readFileSync(adapterPath, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^[ \t]*\/\/.*$/gm, '');

/** A name used as an option key (`name:`) or called as a method (`name(`). */
const isNamed = (code: string, name: string): boolean =>
  new RegExp(String.raw`\b${name}\s*[:(]`).test(code);

/**
 * The 1-based numbers of the responsibilities the adapter discharges.
 *
 * A responsibility counts only when the adapter names EVERY call on its row:
 * opening a session without `access` is not opening it, and answering a commit
 * without `acknowledge` leaves the batch pending for ever.
 */
const dischargedByStudio = (): number[] => {
  const code = adapterCode();
  return HOST_RESPONSIBILITY_CALLS.flatMap((calls, index) =>
    calls.every((call) => isNamed(code, call)) ? [index + 1] : [],
  );
};

describe('the Studio stage-session adapter, against the package host contract', () => {
  /**
   * Both halves of the reading, before anything is concluded from it: the file
   * this test names is the adapter (a moved or renamed one would otherwise
   * report every responsibility unwired), and the comment stripping has not
   * eaten the code it is meant to leave behind.
   */
  it('is reading the adapter, with its comments removed', () => {
    const code = adapterCode();

    expect(code).toContain('new ProtocolBuilderSessionStore(');
    expect(code).not.toContain('Handing a batch over here');
  });

  /**
   * Four of the six, and which four.
   *
   * 1 — the store is constructed with the draft's sections, the revision they
   * were read at and the access the lease granted; 2 — `onCommands` commits
   * each batch through the RPC client and answers with
   * `receiveAuthoritativeUpdate` + `acknowledge`; 3 — a newer draft arriving
   * over the subscription is relayed, as a replacement when the stage itself
   * moved; 4 — a lost or regained lease calls `setAccess`.
   *
   * The exact set rather than a count, so a swap — Studio wiring resources and
   * dropping the lock relay — fails here rather than passing as "still four".
   */
  it('discharges the first four', () => {
    expect(dischargedByStudio()).toEqual([1, 2, 3, 4]);
  });

  /**
   * And not the other two, which are the proof host's alone.
   *
   * Studio supplies no `onCompoundEdit` — a compound edit would have to travel
   * the same commit queue as the batches, or the server would judge it against
   * a stage without them — and no `resourceGateway`, because neither has a
   * transport on the Studio side yet. Both are proved by
   * `src/testing/StudioProofHost.stories.tsx` in the package instead.
   *
   * Asserted rather than left implicit, and against the package's own
   * sentences, so the failure names what Studio started doing.
   */
  it('leaves the compound-edit and resource responsibilities to the proof host', () => {
    const unwired = HOST_RESPONSIBILITIES.filter(
      (_, index) => !dischargedByStudio().includes(index + 1),
    );

    expect(unwired).toEqual([
      HOST_RESPONSIBILITIES[4],
      HOST_RESPONSIBILITIES[5],
    ]);
  });
});
