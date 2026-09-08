import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HOST_RESPONSIBILITIES,
  HOST_RESPONSIBILITY_CALLS,
} from '../testing/hostResponsibilities.ts';

/**
 * The README's host-contract section, generated from the contract itself.
 *
 * A README is the one artefact in a package that nothing runs, so it rots
 * silently and is believed anyway: a host author reading "six things" after a
 * seventh has landed writes a host that is missing one. The list is therefore
 * not written in the Markdown at all — it is rendered from
 * `HOST_RESPONSIBILITIES` and the calls beside it, and this test fails when
 * the file and the constants disagree.
 *
 * The rest of the README is prose about behaviour and is not generated: what
 * is guarded here is the part that has a machine-readable source.
 */
const readmePath = join(process.cwd(), 'README.md');

const START = '<!-- HOST_RESPONSIBILITIES:start -->';
const END = '<!-- HOST_RESPONSIBILITIES:end -->';

/** The prose width the rest of the file is written to. */
const WIDTH = 78;

/**
 * Greedy wrap, so the generated block reads like the prose around it.
 *
 * A single long line per responsibility would also compare correctly and would
 * make the section unreadable in a diff — which is the state the generated
 * section exists to avoid.
 */
const wrap = (
  text: string,
  firstPrefix: string,
  restPrefix: string,
): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last === undefined) return [`${firstPrefix}${word}`];
    const extended = `${last} ${word}`;
    if (extended.length <= WIDTH) {
      return [...lines.slice(0, -1), extended];
    }
    return [...lines, `${restPrefix}${word}`];
  }, []);

const renderBlock = (): string => {
  const items = HOST_RESPONSIBILITIES.flatMap((statement, index) => {
    const calls = HOST_RESPONSIBILITY_CALLS[index];
    if (calls === undefined) {
      throw new Error(
        `Responsibility ${index + 1} has no calls beside it, so the README cannot say how a host discharges it.`,
      );
    }
    const marker = `${index + 1}. `;
    return [
      ...wrap(statement, marker, ' '.repeat(marker.length)),
      `   — ${calls.map((call) => `\`${call}\``).join(', ')}`,
    ];
  });

  return [START, '', ...items, '', END].join('\n');
};

describe('the package README', () => {
  it('is where this test thinks it is', () => {
    expect(readFileSync(readmePath, 'utf8')).toContain(
      '# @codaco/protocol-builder',
    );
  });

  /**
   * Both constants describe the same six things, and the README renders them
   * side by side. A statement added without the calls that discharge it would
   * throw in `renderBlock` above; this is the other direction.
   */
  it('has one row of session calls per host responsibility', () => {
    expect(HOST_RESPONSIBILITY_CALLS).toHaveLength(
      HOST_RESPONSIBILITIES.length,
    );
  });

  it('states the host contract exactly as the package declares it', () => {
    const contents = readFileSync(readmePath, 'utf8');
    const start = contents.indexOf(START);
    const end = contents.indexOf(END);

    // Named rather than assumed: a README whose markers were deleted would
    // otherwise compare an empty block against an empty block.
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    expect(contents.slice(start, end + END.length)).toBe(renderBlock());
  });
});
