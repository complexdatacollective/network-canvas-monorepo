import { ORPCError } from '@orpc/client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
  type AuditActorFilter,
  type AuditCategory,
  type AuditEventSummary,
  type AuditOutcome,
} from '@codaco/studio-rpc';

import { orpc } from '../lib/api.ts';

const route = getRouteApi('/authenticated/teams/$teamId/activity');

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  team_access: 'Team access',
  protocol: 'Protocols',
  study: 'Studies',
  participant_data: 'Participant data',
  data_egress: 'Data egress',
  credential: 'Credentials',
  integration: 'Integrations',
  security: 'Security',
  audit: 'Activity log',
};

const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  succeeded: 'Succeeded',
  denied: 'Denied',
  failed: 'Failed',
};

const OUTCOME_BADGE_VARIANTS: Record<
  AuditOutcome,
  'secondary' | 'outline' | 'destructive'
> = {
  succeeded: 'secondary',
  denied: 'outline',
  failed: 'destructive',
};

const ACTOR_KIND_LABELS: Record<string, string> = {
  api_token: 'API token',
  system: 'System',
};

type ActivityFilters = {
  category: '' | AuditCategory;
  outcome: '' | AuditOutcome;
  eventType: string;
  actor: AuditActorFilter | null;
  from: string;
  to: string;
};

const EMPTY_FILTERS: ActivityFilters = {
  category: '',
  outcome: '',
  eventType: '',
  actor: null,
  from: '',
  to: '',
};

// A <select> value is a string, but an actor is the (kind, id) pair the feed
// renders — and a system actor may have no id at all. The token is a DOM-layer
// encoding: every value is decoded back to the typed filter through the option
// list before it reaches the RPC input, so no sentinel string crosses the wire.
function actorToken(actor: AuditActorFilter): string {
  return `${actor.kind}:${actor.id ?? ''}`;
}

function isCategory(value: string): value is AuditCategory {
  return (AUDIT_CATEGORIES as readonly string[]).includes(value);
}

function isOutcome(value: string): value is AuditOutcome {
  return (AUDIT_OUTCOMES as readonly string[]).includes(value);
}

function hasActiveFilter(filters: ActivityFilters): boolean {
  return Object.values(filters).some((value) => value !== '' && value !== null);
}

// Filter values become the audit.list input; from/to use the viewer's local
// day boundaries to match the local times shown in the feed.
function listInput(teamId: string, filters: ActivityFilters) {
  return {
    teamId,
    ...(filters.category === '' ? {} : { categories: [filters.category] }),
    ...(filters.outcome === '' ? {} : { outcomes: [filters.outcome] }),
    ...(filters.eventType === '' ? {} : { eventTypes: [filters.eventType] }),
    ...(filters.actor === null ? {} : { actor: filters.actor }),
    ...(filters.from === ''
      ? {}
      : { from: new Date(`${filters.from}T00:00:00`) }),
    ...(filters.to === ''
      ? {}
      : { to: new Date(`${filters.to}T23:59:59.999`) }),
  };
}

// The filter values change only when the team records a new kind of action or
// a new actor acts for the first time, so a visit's worth of staleness costs
// nothing and saves a second read on every remount.
const FILTER_OPTIONS_STALE_MS = 5 * 60 * 1000;

const timestampFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function isForbidden(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'FORBIDDEN';
}

// A permission refusal never resolves by retrying, and every denied attempt is
// audited server-side, so a retried read writes further audit.read_denied
// events. Shared by both audit reads.
function retryUnlessForbidden(failureCount: number, error: unknown): boolean {
  return !isForbidden(error) && failureCount < 3;
}

function actorText(actor: AuditActorFilter & { label: string }): string {
  const kind = ACTOR_KIND_LABELS[actor.kind];
  if (kind === undefined) return actor.label;
  // An actor with no name of its own is named by its kind alone, rather than
  // by a parenthetical hanging off an empty string.
  return actor.label === '' ? kind : `${actor.label} (${kind})`;
}

function detailValueText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string')
  ) {
    return value.join(', ');
  }
  // `details` is Record<string, unknown> here, so the fallback has to be total:
  // JSON.stringify is typed as returning a string but returns undefined for
  // undefined, and throws on values JSON cannot express.
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export default function TeamActivity() {
  const { teamId } = route.useParams();
  const [staged, setStaged] = useState<ActivityFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<ActivityFilters>(EMPTY_FILTERS);
  const dialog = useDialog();

  const input = useMemo(() => listInput(teamId, applied), [teamId, applied]);
  const activity = useInfiniteQuery(
    orpc.audit.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        ...input,
        ...(cursor === undefined ? {} : { cursor }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      retry: retryUnlessForbidden,
    }),
  );

  const items = useMemo(
    () => activity.data?.pages.flatMap((page) => page.items) ?? [],
    [activity.data],
  );

  // The filter values are a property of the team's whole history, not of the
  // pages that happen to be loaded: drawing them from `items` would hide any
  // action or actor that appears only in older history, and would collapse to
  // the single applied value once a filter narrowed the feed. They are also
  // invariant across pages and across filter changes, so this query is keyed
  // on the team alone and neither refetches on Load more nor on Apply.
  const filterOptions = useQuery(
    orpc.audit.filterOptions.queryOptions({
      input: { teamId },
      staleTime: FILTER_OPTIONS_STALE_MS,
      // A second audit read only after the first has succeeded: each denied
      // attempt commits a rate-limited audit.read_denied event, and a member
      // who cannot read the log must not spend two of that budget per visit.
      enabled: activity.isSuccess,
      retry: retryUnlessForbidden,
    }),
  );

  const actionOptions = useMemo(() => {
    const byType = new Map<string, string>(
      filterOptions.data?.actions.map(({ eventType, title }) => [
        eventType,
        title,
      ]),
    );
    // An applied value the options no longer carry keeps its own entry, so the
    // select cannot silently fall back to its placeholder while the filter is
    // still applied.
    if (applied.eventType !== '' && !byType.has(applied.eventType)) {
      byType.set(applied.eventType, applied.eventType);
    }
    return [...byType.entries()].map(([value, label]) => ({ value, label }));
  }, [filterOptions.data, applied.eventType]);

  const actorOptions = useMemo(() => {
    const byToken = new Map<string, AuditActorFilter & { label: string }>(
      filterOptions.data?.actors.map((actor) => [actorToken(actor), actor]),
    );
    if (applied.actor !== null && !byToken.has(actorToken(applied.actor))) {
      // Nothing but the applied pair is known here, so the id stands in for
      // the name; actorText names an actor with no id by its kind alone.
      byToken.set(actorToken(applied.actor), {
        ...applied.actor,
        label: applied.actor.id ?? '',
      });
    }
    return [...byToken.entries()].map(([value, actor]) => ({
      value,
      label: actorText(actor),
      actor,
    }));
  }, [filterOptions.data, applied.actor]);

  const openDetail = (event: AuditEventSummary) => {
    void dialog.openDialog({
      id: `audit-event-${event.id}`,
      type: 'custom',
      title: event.title,
      children: <ActivityEventDetail teamId={teamId} eventId={event.id} />,
    });
  };

  if (isForbidden(activity.error)) {
    return (
      <main
        id="main-content"
        className="tablet-portrait:p-8 mx-auto flex w-full max-w-6xl flex-col gap-6 p-4"
      >
        <Heading level="h1">Team activity</Heading>
        <Alert>
          Team activity is only available to team owners and admins. Ask a team
          owner if you need access to this record.
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link to="/">Back to your teams</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="tablet-portrait:p-8 mx-auto flex w-full max-w-6xl flex-col gap-6 p-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading level="h1" margin="none">
            Team activity
          </Heading>
          <Paragraph margin="none">
            The immutable record of actions taken in this team, newest first.
          </Paragraph>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/">Back to your teams</Link>
        </Button>
      </div>

      <Surface spacing="lg">
        <form
          aria-label="Activity filters"
          className="phone-landscape:grid-cols-2 tablet-portrait:grid-cols-3 laptop:grid-cols-6 grid items-end gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied(staged);
          }}
        >
          <div>
            <label className="text-sm font-bold" htmlFor="activity-category">
              Category
            </label>
            <NativeSelectField
              id="activity-category"
              name="activity-category"
              className="mt-1"
              size="sm"
              value={staged.category}
              placeholder="All categories"
              options={AUDIT_CATEGORIES.map((category) => ({
                value: category,
                label: CATEGORY_LABELS[category],
              }))}
              onChange={(value) => {
                const category = String(value);
                setStaged((current) => ({
                  ...current,
                  category: isCategory(category) ? category : '',
                }));
              }}
            />
          </div>
          <div>
            <label className="text-sm font-bold" htmlFor="activity-action">
              Action
            </label>
            <NativeSelectField
              id="activity-action"
              name="activity-action"
              className="mt-1"
              size="sm"
              value={staged.eventType}
              placeholder="All actions"
              options={actionOptions}
              onChange={(value) => {
                setStaged((current) => ({
                  ...current,
                  eventType: String(value),
                }));
              }}
            />
          </div>
          <div>
            <label className="text-sm font-bold" htmlFor="activity-actor">
              Actor
            </label>
            <NativeSelectField
              id="activity-actor"
              name="activity-actor"
              className="mt-1"
              size="sm"
              value={staged.actor === null ? '' : actorToken(staged.actor)}
              placeholder="All actors"
              options={actorOptions.map(({ value, label }) => ({
                value,
                label,
              }))}
              onChange={(value) => {
                const selected = actorOptions.find(
                  (option) => option.value === String(value),
                );
                setStaged((current) => ({
                  ...current,
                  actor:
                    selected === undefined
                      ? null
                      : { kind: selected.actor.kind, id: selected.actor.id },
                }));
              }}
            />
          </div>
          <div>
            <label className="text-sm font-bold" htmlFor="activity-outcome">
              Outcome
            </label>
            <NativeSelectField
              id="activity-outcome"
              name="activity-outcome"
              className="mt-1"
              size="sm"
              value={staged.outcome}
              placeholder="All outcomes"
              options={AUDIT_OUTCOMES.map((outcome) => ({
                value: outcome,
                label: OUTCOME_LABELS[outcome],
              }))}
              onChange={(value) => {
                const outcome = String(value);
                setStaged((current) => ({
                  ...current,
                  outcome: isOutcome(outcome) ? outcome : '',
                }));
              }}
            />
          </div>
          <div>
            <label className="text-sm font-bold" htmlFor="activity-from">
              From date
            </label>
            <InputField
              id="activity-from"
              name="activity-from"
              className="mt-1"
              size="sm"
              type="date"
              value={staged.from}
              onChange={(value) => {
                setStaged((current) => ({ ...current, from: value ?? '' }));
              }}
            />
          </div>
          <div>
            <label className="text-sm font-bold" htmlFor="activity-to">
              To date
            </label>
            <InputField
              id="activity-to"
              name="activity-to"
              className="mt-1"
              size="sm"
              type="date"
              value={staged.to}
              onChange={(value) => {
                setStaged((current) => ({ ...current, to: value ?? '' }));
              }}
            />
          </div>
          <div className="phone-landscape:col-span-2 tablet-portrait:col-span-3 laptop:col-span-6 flex gap-3">
            <Button size="sm" type="submit">
              Apply filters
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={!hasActiveFilter(staged) && !hasActiveFilter(applied)}
              onClick={() => {
                setStaged(EMPTY_FILTERS);
                setApplied(EMPTY_FILTERS);
              }}
            >
              Clear filters
            </Button>
          </div>
          {/*
            The option list is capped, and nothing the viewer can do here
            raises the cap: the values come from the team's whole history and
            the other filters do not narrow them. So this says only that the
            menus are incomplete, and does not offer a remedy that would not
            work.
          */}
          {filterOptions.data?.truncated === true && (
            <Paragraph
              className="phone-landscape:col-span-2 tablet-portrait:col-span-3 laptop:col-span-6 text-sm"
              margin="none"
            >
              This team has taken more kinds of action, or has had more actors,
              than these menus can list. Some values are missing from them.
            </Paragraph>
          )}
        </form>
      </Surface>

      <Paragraph className="sr-only" role="status" margin="none">
        {activity.isPending
          ? 'Loading team activity…'
          : `${items.length} activity ${items.length === 1 ? 'event' : 'events'} shown.`}
      </Paragraph>

      {activity.isPending && (
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <Paragraph margin="none">Loading team activity…</Paragraph>
        </div>
      )}

      {activity.isError && !isForbidden(activity.error) && (
        <Alert variant="destructive">
          Team activity could not be loaded.
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void activity.refetch()}
          >
            Retry
          </Button>
        </Alert>
      )}

      {activity.isSuccess && items.length === 0 && (
        <Alert>
          {hasActiveFilter(applied)
            ? 'No activity matches these filters.'
            : 'No activity has been recorded for this team yet.'}
        </Alert>
      )}

      {items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Subject or resource</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((event) => {
                const target = event.subject ?? event.resource;
                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      <time dateTime={event.occurredAt.toISOString()}>
                        {timestampFormat.format(event.occurredAt)}
                      </time>
                    </TableCell>
                    <TableCell>{actorText(event.actor)}</TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => openDetail(event)}
                      >
                        {event.title}
                      </Button>
                      {!event.rendered && (
                        <Badge className="ml-2" variant="outline">
                          Unrecognized event
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{target?.label ?? target?.id ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_BADGE_VARIANTS[event.outcome]}>
                        {OUTCOME_LABELS[event.outcome]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {activity.hasNextPage ? (
            <div>
              <Button
                variant="outline"
                disabled={activity.isFetchingNextPage}
                onClick={() => void activity.fetchNextPage()}
              >
                {activity.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          ) : (
            <Paragraph className="text-sm opacity-70" margin="none">
              This is the beginning of the recorded activity for this team.
              Actions taken before activity recording was enabled are not
              available.
            </Paragraph>
          )}
        </>
      )}
    </main>
  );
}

function ActivityEventDetail(props: { teamId: string; eventId: string }) {
  const detail = useQuery(
    orpc.audit.get.queryOptions({
      input: { teamId: props.teamId, eventId: props.eventId },
      retry: retryUnlessForbidden,
    }),
  );

  if (detail.isPending) {
    return (
      <div className="flex items-center gap-3" role="status">
        <Spinner size="sm" />
        <Paragraph margin="none">Loading event…</Paragraph>
      </div>
    );
  }

  if (detail.isError) {
    return (
      <Alert variant="destructive">
        The event could not be loaded.
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={() => void detail.refetch()}
        >
          Retry
        </Button>
      </Alert>
    );
  }

  const event = detail.data;
  const detailEntries = Object.entries(event.details);
  const fields: { label: string; value: string }[] = [
    { label: 'Time', value: timestampFormat.format(event.occurredAt) },
    { label: 'Time (UTC)', value: event.occurredAt.toISOString() },
    { label: 'Actor', value: actorText(event.actor) },
    ...(event.actor.id === null
      ? []
      : [{ label: 'Actor ID', value: event.actor.id }]),
    ...(event.subject
      ? [
          {
            label: 'Subject',
            value: `${event.subject.label ?? event.subject.id ?? ''} (${event.subject.type})`,
          },
        ]
      : []),
    ...(event.resource
      ? [
          {
            label: 'Resource',
            value: `${event.resource.label ?? event.resource.id ?? ''} (${event.resource.type})`,
          },
        ]
      : []),
    { label: 'Outcome', value: OUTCOME_LABELS[event.outcome] },
    { label: 'Category', value: CATEGORY_LABELS[event.category] },
    {
      label: 'Event type',
      value: `${event.eventType} (version ${event.eventVersion})`,
    },
    { label: 'Team', value: event.teamLabel },
    { label: 'Sequence', value: event.sequence },
    { label: 'Request ID', value: event.requestId },
  ];

  return (
    <div className="flex flex-col gap-4">
      {!event.rendered && (
        <Alert>
          Studio does not recognize this event type. It was likely recorded by a
          newer version of Studio; its identifying information is shown without
          further detail.
        </Alert>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {fields.map((field) => (
          <div key={field.label} className="col-span-2 grid grid-cols-subgrid">
            <dt className="font-bold">{field.label}</dt>
            <dd className="m-0 break-all">{field.value}</dd>
          </div>
        ))}
      </dl>
      {detailEntries.length > 0 && (
        <section aria-label="Event details">
          <Heading level="h3" margin="none">
            Details
          </Heading>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {detailEntries.map(([key, value]) => (
              <div key={key} className="col-span-2 grid grid-cols-subgrid">
                <dt className="font-bold">{key}</dt>
                <dd className="m-0 break-all">{detailValueText(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
