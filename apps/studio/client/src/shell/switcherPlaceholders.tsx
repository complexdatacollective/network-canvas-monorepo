/**
 * Placeholder values for the two things the switcher shows that nothing can
 * answer yet.
 *
 * **Everything in this file is invented, and all of it is meant to be deleted.**
 * It exists in one module, rather than inline at the call sites, so replacing
 * it with real reads is a single edit and so that nothing elsewhere in the
 * shell can start treating these as facts.
 *
 * What is missing, and what would replace it:
 *
 * - **Studies per team.** `authClient.useListOrganizations()` answers
 *   `{ id, name, slug, createdAt, logo?, metadata? }`, and the only study
 *   listing is `protocols.list`, which is scoped to one team — counting every
 *   team would mean one request per team on every render of the header. A
 *   count belongs on the team listing itself.
 * - **A study's status.** `ProtocolSummarySchema` is `id`, `draftId`, `name`,
 *   `createdAt`, `updatedAt`. Nothing records whether a study is collecting,
 *   still a draft, or closed.
 *
 * Deliberately NOT here: a team's role. That one is permission-adjacent, and
 * a placeholder claiming a researcher owns a team they are a member of would
 * be a false statement about what they may do. The switcher shows the role
 * where it is genuinely known — the active team, through `teamRole` — and
 * shows none where it is not, which is a smaller lie than a confident wrong
 * one.
 *
 * Derived from the entity id rather than random, so a value does not change
 * under the researcher between two renders of the same screen while we are
 * looking at it.
 */

/** The statuses a study will eventually report. */
const PLACEHOLDER_STATUSES = [
  { label: 'Collecting', dot: 'bg-success' },
  { label: 'Draft', dot: 'bg-input-contrast/40' },
  { label: 'Closed', dot: 'bg-warning' },
] as const;

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/** PLACEHOLDER. A team's study count, as the switcher's supporting line. */
export function placeholderTeamMeta(teamId: string): string {
  const count = 1 + (hash(`${teamId}::studies`) % 14);
  // Whole strings rather than a stitched-together plural: the two readings
  // differ by more than an "s" in most languages this will be translated into.
  return count === 1 ? '1 study' : `${count} studies`;
}

/** PLACEHOLDER. A study's status, as a label and the pip that stands for it. */
export function placeholderStudyStatus(studyId: string): {
  label: string;
  dot: string;
} {
  const status =
    PLACEHOLDER_STATUSES[
      hash(`${studyId}::status`) % PLACEHOLDER_STATUSES.length
    ];
  return status ?? PLACEHOLDER_STATUSES[0];
}

/**
 * PLACEHOLDER. The pip that stands for a study's status.
 *
 * `aria-hidden`, and paired with the status word in the row's supporting line,
 * so the colour never carries the meaning on its own (WCAG 1.4.1).
 */
export function PlaceholderStatusPip({ studyId }: { studyId: string }) {
  const { dot } = placeholderStudyStatus(studyId);
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${dot}`}
    />
  );
}
