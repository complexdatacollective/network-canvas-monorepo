import { BookMarked, Download, Plus, UserPlus } from 'lucide-react';

import type {
  EverythingBarItem,
  EverythingBarProvider,
  EverythingBarSearchPage,
} from '@codaco/fresco-ui/navigation/EverythingBar';

/**
 * MOCK EVERYTHING-BAR PROVIDERS — FIXTURES, NOT INTEGRATIONS.
 * ==========================================================
 *
 * Everything in this file is invented. It exists so the app shell can mount the
 * everything bar with all three groups populated before the features behind two
 * of them exist, and every export here is deleted by the slice that replaces
 * it:
 *
 * - **Commands** (`createMockCommandsProvider`) is replaced by the Studio-local
 *   command registry of the everything-bar design §5.3 — a typed registry each
 *   area layout contributes to, filtered by capability, topology and an
 *   `availability` predicate, landing in that design's slice 2. The four
 *   commands below are plausible entries in it, and the surfaces they name
 *   (`studies.create`, `members.invite`, `export.start`, `codebook.open`) are
 *   registered by the screens that own them under #1249, #1263, #1324 and
 *   #1273. Until then nothing consumes the request — see `surfaceRequests.ts`.
 *
 * - **Documentation** (`createMockDocumentationProvider`) is replaced by the
 *   `search.documentation` procedure of §5.5, answered server-side from a
 *   documentation index the instance holds, in the everything-bar design's
 *   slice 3. The shape below is that procedure's shape — debounced, abortable,
 *   cursor-paged — so the swap is a change of data source and nothing else.
 *
 * The launcher rule (invariant 3) is respected by the fixtures as strictly as
 * it will be by the real registries: every command is `{ kind: 'open', href,
 * surface }`, which is a route plus a name the destination screen resolves.
 * NOTHING HERE MUTATES ANYTHING, and the activation type admits no callback
 * that could.
 */

/**
 * How long the fixture pretends the server takes. Long enough that the
 * per-group pending row is observable, short enough not to be felt.
 */
const MOCK_DOCUMENTATION_DELAY_MS = 200;

/**
 * The query the documentation fixture fails, so the bar's retryable error row
 * can be seen without unplugging anything. The real provider fails when the RPC
 * does; this one needs a trigger, and a named one is better than a random one.
 */
export const MOCK_DOCUMENTATION_FAILING_QUERY = 'unavailable';

/** Results per page, matching §3.4's default group bound. */
const MOCK_DOCUMENTATION_PAGE_SIZE = 5;

type MockCommandContext = {
  /** The team the researcher is acting in, if one is known. */
  teamId?: string;
  /** The study the URL names, if any. */
  studyId?: string;
};

/**
 * A handful of plausible Studio commands.
 *
 * Each belongs to a screen, so each is an `open` activation: the route that
 * owns the action, plus the identifier that screen will register for its own
 * dialog. A command whose owning resource is not in context is absent rather
 * than pointing at a route that cannot be built.
 */
function mockCommandItems({
  teamId,
  studyId,
}: MockCommandContext): EverythingBarItem[] {
  return [
    ...(studyId === undefined
      ? []
      : [
          {
            id: `study:${studyId}:export.start`,
            group: 'commands' as const,
            label: 'Export this study',
            context: 'Study',
            icon: Download,
            rank: { tier: 0, position: 0 },
            activate: {
              kind: 'open' as const,
              href: `/study/${studyId}/export`,
              surface: 'export.start',
            },
          },
          {
            id: `study:${studyId}:codebook.open`,
            group: 'commands' as const,
            label: 'Open the codebook',
            context: 'Protocol',
            icon: BookMarked,
            rank: { tier: 0, position: 1 },
            activate: {
              kind: 'open' as const,
              href: `/study/${studyId}/editor/codebook`,
              surface: 'codebook.open',
            },
          },
        ]),
    ...(teamId === undefined
      ? []
      : [
          {
            id: `team:${teamId}:members.invite`,
            group: 'commands' as const,
            label: 'Invite a team member',
            context: 'Team',
            icon: UserPlus,
            rank: { tier: 1, position: 0 },
            activate: {
              kind: 'open' as const,
              href: `/team/${teamId}/members`,
              surface: 'members.invite',
            },
          },
          {
            id: `team:${teamId}:studies.create`,
            group: 'commands' as const,
            label: 'Create a study',
            context: 'Team',
            icon: Plus,
            rank: { tier: 1, position: 1 },
            activate: {
              kind: 'open' as const,
              href: `/team/${teamId}`,
              surface: 'studies.create',
            },
          },
        ]),
  ];
}

/**
 * The commands fixture as a provider. Local, because the real registry will be
 * local too: commands are declared in the client and filtered against context
 * the shell already holds, never fetched.
 */
export function createMockCommandsProvider(
  context: MockCommandContext,
): EverythingBarProvider {
  const items = mockCommandItems(context);

  return {
    id: 'commands',
    local: true,
    persistence: 'recents',
    items: () => items,
    resolve: (id) =>
      Promise.resolve(items.find((item) => item.id === id) ?? null),
  };
}

/** The fixture's whole index: heading-anchored records, as §6's artifact has. */
const MOCK_DOCUMENTATION_RECORDS: Array<{
  id: string;
  title: string;
  hierarchy: string;
  url: string;
}> = [
  {
    id: 'docs:studio-participants',
    title: 'Managing participants',
    hierarchy: 'Studio · Run a study',
    url: 'https://documentation.networkcanvas.com/en/studio/participants',
  },
  {
    id: 'docs:studio-waves',
    title: 'Collecting in waves',
    hierarchy: 'Studio · Run a study',
    url: 'https://documentation.networkcanvas.com/en/studio/waves',
  },
  {
    id: 'docs:studio-invitations',
    title: 'Inviting people to your team',
    hierarchy: 'Studio · Teams',
    url: 'https://documentation.networkcanvas.com/en/studio/team-invitations',
  },
  {
    id: 'docs:studio-exports',
    title: 'Exporting collected data',
    hierarchy: 'Studio · Analyse',
    url: 'https://documentation.networkcanvas.com/en/studio/exports',
  },
  {
    id: 'docs:protocols-codebook',
    title: 'The codebook',
    hierarchy: 'Design protocols · Concepts',
    url: 'https://documentation.networkcanvas.com/en/design-protocols/codebook',
  },
  {
    id: 'docs:protocols-name-generators',
    title: 'Name generator interfaces',
    hierarchy: 'Design protocols · Interfaces',
    url: 'https://documentation.networkcanvas.com/en/design-protocols/name-generators',
  },
  {
    id: 'docs:protocols-variables',
    title: 'Variables and validation',
    hierarchy: 'Design protocols · Concepts',
    url: 'https://documentation.networkcanvas.com/en/design-protocols/variables',
  },
  {
    id: 'docs:key-concepts-networks',
    title: 'Personal networks',
    hierarchy: 'Key concepts',
    url: 'https://documentation.networkcanvas.com/en/key-concepts/networks',
  },
];

/**
 * A timer that loses to its abort signal, so a superseded keystroke stops this
 * page rather than letting it resolve late — the real provider gets the same
 * behaviour from `fetch`.
 */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

/**
 * The documentation fixture: `local: false`, so the bar debounces it, aborts
 * superseded queries, and renders a pending row per group while it is out; and
 * `persistence: 'never'`, so no documentation result is ever written to local
 * recents.
 *
 * `position` is the record's ABSOLUTE index in the query's accumulated result
 * sequence, not its index within the page, which is what keeps a server-ranked
 * order through the merge when a second page arrives (§5.1).
 */
export function createMockDocumentationProvider(): EverythingBarProvider {
  return {
    id: 'documentation',
    local: false,
    groups: ['documentation'],
    persistence: 'never',
    search: async (
      query: string,
      signal: AbortSignal,
      cursor?: string,
    ): Promise<EverythingBarSearchPage> => {
      await delay(MOCK_DOCUMENTATION_DELAY_MS, signal);

      if (query.toLowerCase().includes(MOCK_DOCUMENTATION_FAILING_QUERY)) {
        throw new Error('The documentation index could not be reached.');
      }

      const folded = query.toLowerCase();
      const matches = MOCK_DOCUMENTATION_RECORDS.filter((record) =>
        `${record.title} ${record.hierarchy}`.toLowerCase().includes(folded),
      );

      const offset = Number.parseInt(cursor ?? '0', 10);
      const from = Number.isFinite(offset) && offset > 0 ? offset : 0;
      const page = matches.slice(from, from + MOCK_DOCUMENTATION_PAGE_SIZE);
      const next = from + page.length;

      return {
        items: page.map((record, index) => ({
          id: record.id,
          group: 'documentation',
          label: record.title,
          context: record.hierarchy,
          rank: { tier: 0, position: from + index },
          activate: { kind: 'external', href: record.url },
        })),
        ...(next < matches.length ? { next: String(next) } : {}),
      };
    },
  };
}
