import { ORPCError } from '@orpc/client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
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

// The route id carries the area layout it sits under (§5.3).
const route = getRouteApi('/app/team/$teamId/activity');

const categoryMessages = defineMessages({
  teamAccess: {
    id: 'studio.teamActivity.categoryTeamAccess',
    defaultMessage: 'Team access',
    description: 'Audit category: membership, invitations and role changes.',
  },
  protocol: {
    id: 'studio.teamActivity.categoryProtocol',
    defaultMessage: 'Protocols',
    description: 'Audit category: protocol design and publication.',
  },
  study: {
    id: 'studio.teamActivity.categoryStudy',
    defaultMessage: 'Studies',
    description: 'Audit category: study lifecycle actions.',
  },
  participantData: {
    id: 'studio.teamActivity.categoryParticipantData',
    defaultMessage: 'Participant data',
    description: 'Audit category: reads and writes of participant data.',
  },
  dataEgress: {
    id: 'studio.teamActivity.categoryDataEgress',
    defaultMessage: 'Data egress',
    description: 'Audit category: exports and other data leaving Studio.',
  },
  credential: {
    id: 'studio.teamActivity.categoryCredential',
    defaultMessage: 'Credentials',
    description: 'Audit category: API tokens and other credentials.',
  },
  integration: {
    id: 'studio.teamActivity.categoryIntegration',
    defaultMessage: 'Integrations',
    description: 'Audit category: webhooks and external integrations.',
  },
  security: {
    id: 'studio.teamActivity.categorySecurity',
    defaultMessage: 'Security',
    description: 'Audit category: security-relevant events.',
  },
  audit: {
    id: 'studio.teamActivity.categoryAudit',
    defaultMessage: 'Activity log',
    description: 'Audit category: reads of the activity log itself.',
  },
});

const CATEGORY_LABELS: Record<AuditCategory, MessageDescriptor> = {
  team_access: categoryMessages.teamAccess,
  protocol: categoryMessages.protocol,
  study: categoryMessages.study,
  participant_data: categoryMessages.participantData,
  data_egress: categoryMessages.dataEgress,
  credential: categoryMessages.credential,
  integration: categoryMessages.integration,
  security: categoryMessages.security,
  audit: categoryMessages.audit,
};

const outcomeMessages = defineMessages({
  succeeded: {
    id: 'studio.teamActivity.outcomeSucceeded',
    defaultMessage: 'Succeeded',
    description: 'Audit outcome: the action completed.',
  },
  denied: {
    id: 'studio.teamActivity.outcomeDenied',
    defaultMessage: 'Denied',
    description: 'Audit outcome: the action was refused by authorization.',
  },
  failed: {
    id: 'studio.teamActivity.outcomeFailed',
    defaultMessage: 'Failed',
    description: 'Audit outcome: the action was attempted and failed.',
  },
});

const OUTCOME_LABELS: Record<AuditOutcome, MessageDescriptor> = {
  succeeded: outcomeMessages.succeeded,
  denied: outcomeMessages.denied,
  failed: outcomeMessages.failed,
};

const OUTCOME_BADGE_VARIANTS: Record<
  AuditOutcome,
  'secondary' | 'outline' | 'destructive'
> = {
  succeeded: 'secondary',
  denied: 'outline',
  failed: 'destructive',
};

const actorKindMessages = defineMessages({
  apiToken: {
    id: 'studio.teamActivity.actorKindApiToken',
    defaultMessage: 'API token',
    description: 'Kind label for an audit actor that is an API token.',
  },
  system: {
    id: 'studio.teamActivity.actorKindSystem',
    defaultMessage: 'System',
    description: 'Kind label for an audit actor that is Studio itself.',
  },
});

const ACTOR_KIND_LABELS: Record<string, MessageDescriptor> = {
  api_token: actorKindMessages.apiToken,
  system: actorKindMessages.system,
};

const messages = defineMessages({
  heading: {
    id: 'studio.teamActivity.heading',
    defaultMessage: 'Team activity',
    description: "Heading of a team's activity log screen.",
  },
  forbidden: {
    id: 'studio.teamActivity.forbidden',
    defaultMessage:
      'Team activity is only available to team owners and admins. Ask a team owner if you need access to this record.',
    description: 'Shown to a member whose role may not read the activity log.',
  },
  backToStudies: {
    id: 'studio.teamActivity.backToStudies',
    defaultMessage: 'Back to this team\u2019s studies',
    description: "Link from the activity log back to the team's study list.",
  },
  intro: {
    id: 'studio.teamActivity.intro',
    defaultMessage:
      'The immutable record of actions taken in this team, newest first.',
    description: "Introduction under the activity log's heading.",
  },
  filtersLabel: {
    id: 'studio.teamActivity.filtersLabel',
    defaultMessage: 'Activity filters',
    description: 'Accessible name of the activity filter form.',
  },
  categoryLabel: {
    id: 'studio.teamActivity.categoryLabel',
    defaultMessage: 'Category',
    description: "Label of the filter form's category selector.",
  },
  allCategories: {
    id: 'studio.teamActivity.allCategories',
    defaultMessage: 'All categories',
    description: 'Placeholder option meaning no category filter.',
  },
  actionFilterLabel: {
    id: 'studio.teamActivity.actionFilterLabel',
    defaultMessage: 'Action',
    description: "Label of the filter form's action selector.",
  },
  allActions: {
    id: 'studio.teamActivity.allActions',
    defaultMessage: 'All actions',
    description: 'Placeholder option meaning no action filter.',
  },
  actorFilterLabel: {
    id: 'studio.teamActivity.actorFilterLabel',
    defaultMessage: 'Actor',
    description: "Label of the filter form's actor selector.",
  },
  allActors: {
    id: 'studio.teamActivity.allActors',
    defaultMessage: 'All actors',
    description: 'Placeholder option meaning no actor filter.',
  },
  outcomeFilterLabel: {
    id: 'studio.teamActivity.outcomeFilterLabel',
    defaultMessage: 'Outcome',
    description: "Label of the filter form's outcome selector.",
  },
  allOutcomes: {
    id: 'studio.teamActivity.allOutcomes',
    defaultMessage: 'All outcomes',
    description: 'Placeholder option meaning no outcome filter.',
  },
  fromDate: {
    id: 'studio.teamActivity.fromDate',
    defaultMessage: 'From date',
    description: "Label of the filter form's start-date field.",
  },
  toDate: {
    id: 'studio.teamActivity.toDate',
    defaultMessage: 'To date',
    description: "Label of the filter form's end-date field.",
  },
  applyFilters: {
    id: 'studio.teamActivity.applyFilters',
    defaultMessage: 'Apply filters',
    description: 'Submit button of the activity filter form.',
  },
  clearFilters: {
    id: 'studio.teamActivity.clearFilters',
    defaultMessage: 'Clear filters',
    description: 'Button resetting every activity filter.',
  },
  filterOptionsTruncated: {
    id: 'studio.teamActivity.filterOptionsTruncated',
    defaultMessage:
      'This team has taken more kinds of action, or has had more actors, than these menus can list. Some values are missing from them.',
    description:
      'Shown when the filter menus could not list every historical action or actor.',
  },
  loading: {
    id: 'studio.teamActivity.loading',
    defaultMessage: 'Loading team activity…',
    description: 'Shown while the activity feed loads.',
  },
  eventsShown: {
    id: 'studio.teamActivity.eventsShown',
    defaultMessage:
      '{count, plural, one {# activity event shown.} other {# activity events shown.}}',
    description:
      'Politely announced count of activity events currently listed.',
  },
  loadFailed: {
    id: 'studio.teamActivity.loadFailed',
    defaultMessage: 'Team activity could not be loaded.',
    description: 'Shown when the activity feed could not be fetched.',
  },
  retry: {
    id: 'studio.teamActivity.retry',
    defaultMessage: 'Retry',
    description: 'Button retrying a failed activity read.',
  },
  noMatches: {
    id: 'studio.teamActivity.noMatches',
    defaultMessage: 'No activity matches these filters.',
    description: 'Shown when the applied filters match no events.',
  },
  noneRecorded: {
    id: 'studio.teamActivity.noneRecorded',
    defaultMessage: 'No activity has been recorded for this team yet.',
    description: 'Shown when the team has no recorded activity at all.',
  },
  whenColumn: {
    id: 'studio.teamActivity.whenColumn',
    defaultMessage: 'When',
    description: 'Activity table column heading: when the event happened.',
  },
  actorColumn: {
    id: 'studio.teamActivity.actorColumn',
    defaultMessage: 'Actor',
    description: 'Activity table column heading: who performed the action.',
  },
  actionColumn: {
    id: 'studio.teamActivity.actionColumn',
    defaultMessage: 'Action',
    description: 'Activity table column heading: what was done.',
  },
  subjectColumn: {
    id: 'studio.teamActivity.subjectColumn',
    defaultMessage: 'Subject or resource',
    description: 'Activity table column heading: what the action was about.',
  },
  outcomeColumn: {
    id: 'studio.teamActivity.outcomeColumn',
    defaultMessage: 'Outcome',
    description: 'Activity table column heading: how the action ended.',
  },
  unrecognizedEvent: {
    id: 'studio.teamActivity.unrecognizedEvent',
    defaultMessage: 'Unrecognized event',
    description:
      'Badge on an event row whose type this Studio version cannot render.',
  },
  loadingMore: {
    id: 'studio.teamActivity.loadingMore',
    defaultMessage: 'Loading more…',
    description: 'Shown on the load-more button while a page is loading.',
  },
  loadMore: {
    id: 'studio.teamActivity.loadMore',
    defaultMessage: 'Load more',
    description: 'Button loading the next page of activity events.',
  },
  beginning: {
    id: 'studio.teamActivity.beginning',
    defaultMessage:
      'This is the beginning of the recorded activity for this team. Actions taken before activity recording was enabled are not available.',
    description: 'Shown under the last page of the activity feed.',
  },
  loadingEvent: {
    id: 'studio.teamActivity.loadingEvent',
    defaultMessage: 'Loading event…',
    description: "Shown while one event's detail dialog loads.",
  },
  eventLoadFailed: {
    id: 'studio.teamActivity.eventLoadFailed',
    defaultMessage: 'The event could not be loaded.',
    description: "Shown when one event's detail could not be fetched.",
  },
  detailTime: {
    id: 'studio.teamActivity.detailTime',
    defaultMessage: 'Time',
    description: 'Event detail field: when the event happened, local time.',
  },
  detailTimeUtc: {
    id: 'studio.teamActivity.detailTimeUtc',
    defaultMessage: 'Time (UTC)',
    description: 'Event detail field: when the event happened, in UTC.',
  },
  detailActor: {
    id: 'studio.teamActivity.detailActor',
    defaultMessage: 'Actor',
    description: 'Event detail field: who performed the action.',
  },
  detailActorId: {
    id: 'studio.teamActivity.detailActorId',
    defaultMessage: 'Actor ID',
    description: "Event detail field: the actor's identifier.",
  },
  detailSubject: {
    id: 'studio.teamActivity.detailSubject',
    defaultMessage: 'Subject',
    description: 'Event detail field: who or what the action was about.',
  },
  detailResource: {
    id: 'studio.teamActivity.detailResource',
    defaultMessage: 'Resource',
    description: 'Event detail field: the resource the action touched.',
  },
  detailOutcome: {
    id: 'studio.teamActivity.detailOutcome',
    defaultMessage: 'Outcome',
    description: 'Event detail field: how the action ended.',
  },
  detailCategory: {
    id: 'studio.teamActivity.detailCategory',
    defaultMessage: 'Category',
    description: 'Event detail field: which audit category the event is in.',
  },
  detailEventType: {
    id: 'studio.teamActivity.detailEventType',
    defaultMessage: 'Event type',
    description: 'Event detail field: the machine name of the event type.',
  },
  detailTeam: {
    id: 'studio.teamActivity.detailTeam',
    defaultMessage: 'Team',
    description: 'Event detail field: the team the event belongs to.',
  },
  detailSequence: {
    id: 'studio.teamActivity.detailSequence',
    defaultMessage: 'Sequence',
    description:
      "Event detail field: the event's position in the immutable log.",
  },
  detailRequestId: {
    id: 'studio.teamActivity.detailRequestId',
    defaultMessage: 'Request ID',
    description: 'Event detail field: the request identifier for correlation.',
  },
  entityWithType: {
    id: 'studio.teamActivity.entityWithType',
    defaultMessage: '{name} ({type})',
    description:
      "A subject or resource with its wire-level type; {name} is its label and {type} the type's machine name.",
  },
  eventTypeVersion: {
    id: 'studio.teamActivity.eventTypeVersion',
    defaultMessage: '{eventType} (version {version})',
    description:
      'The event type with its schema version; both values are machine names.',
  },
  actorWithKind: {
    id: 'studio.teamActivity.actorWithKind',
    defaultMessage: '{name} ({kind})',
    description:
      "An audit actor with its kind; {name} is the actor's label and {kind} a kind label like API token.",
  },
  unrecognizedDetail: {
    id: 'studio.teamActivity.unrecognizedDetail',
    defaultMessage:
      'Studio does not recognize this event type. It was likely recorded by a newer version of Studio; its identifying information is shown without further detail.',
    description:
      'Shown in the detail dialog of an event type this Studio version cannot render.',
  },
  detailsHeading: {
    id: 'studio.teamActivity.detailsHeading',
    defaultMessage: 'Details',
    description: "Heading of the event detail dialog's extra-details list.",
  },
  detailsSectionLabel: {
    id: 'studio.teamActivity.detailsSectionLabel',
    defaultMessage: 'Event details',
    description:
      "Accessible name of the event detail dialog's extra-details section.",
  },
});

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

// The selected end date runs to the start of the day after it: audit.list
// takes a half-open window, and no inclusive bound a `Date` can express would
// reach the end of a day the server records to the microsecond. Stepping the
// date field rather than adding twenty-four hours keeps the boundary at local
// midnight through a daylight-saving change.
function nextLocalMidnight(day: string): Date {
  const midnight = new Date(`${day}T00:00:00`);
  midnight.setDate(midnight.getDate() + 1);
  return midnight;
}

// Filter values become the audit.list input; from/to use the viewer's local
// day boundaries to match the local times shown in the feed. Both are sent as
// absolute instants, so the viewer's day is the one filtered on whatever
// timezone the server keeps.
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
    ...(filters.to === '' ? {} : { to: nextLocalMidnight(filters.to) }),
  };
}

// The filter values change only when the team records a new kind of action or
// a new actor acts for the first time, so a visit's worth of staleness costs
// nothing and saves a second read on every remount.
const FILTER_OPTIONS_STALE_MS = 5 * 60 * 1000;

function isForbidden(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'FORBIDDEN';
}

// A permission refusal never resolves by retrying, and every denied attempt is
// audited server-side, so a retried read writes further audit.read_denied
// events. Shared by both audit reads.
function retryUnlessForbidden(failureCount: number, error: unknown): boolean {
  return !isForbidden(error) && failureCount < 3;
}

function actorText(
  intl: IntlShape,
  actor: AuditActorFilter & { label: string },
): string {
  const kind = ACTOR_KIND_LABELS[actor.kind];
  if (kind === undefined) return actor.label;
  // An actor with no name of its own is named by its kind alone, rather than
  // by a parenthetical hanging off an empty string.
  return actor.label === ''
    ? intl.formatMessage(kind)
    : intl.formatMessage(messages.actorWithKind, {
        name: actor.label,
        kind: intl.formatMessage(kind),
      });
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
  const intl = useAppIntl();
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
      label: actorText(intl, actor),
      actor,
    }));
  }, [filterOptions.data, applied.actor, intl]);

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
      // The `<main id="main-content">` is the area layout's (§5.3, §7.1).
      <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-6xl flex-col gap-6 p-4">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Alert>{intl.formatMessage(messages.forbidden)}</Alert>
        <div>
          <Button asChild variant="outline">
            <Link to="/team/$teamId" params={{ teamId }}>
              {intl.formatMessage(messages.backToStudies)}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-6xl flex-col gap-6 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading level="h1" margin="none" {...routeFocusTargetProps}>
            {intl.formatMessage(messages.heading)}
          </Heading>
          <Paragraph margin="none">
            {intl.formatMessage(messages.intro)}
          </Paragraph>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/team/$teamId" params={{ teamId }}>
            {intl.formatMessage(messages.backToStudies)}
          </Link>
        </Button>
      </div>

      <Surface spacing="lg">
        <form
          aria-label={intl.formatMessage(messages.filtersLabel)}
          className="phone-landscape:grid-cols-2 tablet-portrait:grid-cols-3 laptop:grid-cols-6 grid items-end gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied(staged);
          }}
        >
          <div>
            <label className="text-sm font-bold" htmlFor="activity-category">
              {intl.formatMessage(messages.categoryLabel)}
            </label>
            <NativeSelectField
              id="activity-category"
              name="activity-category"
              className="mt-1"
              size="sm"
              value={staged.category}
              placeholder={intl.formatMessage(messages.allCategories)}
              options={AUDIT_CATEGORIES.map((category) => ({
                value: category,
                label: intl.formatMessage(CATEGORY_LABELS[category]),
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
              {intl.formatMessage(messages.actionFilterLabel)}
            </label>
            <NativeSelectField
              id="activity-action"
              name="activity-action"
              className="mt-1"
              size="sm"
              value={staged.eventType}
              placeholder={intl.formatMessage(messages.allActions)}
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
              {intl.formatMessage(messages.actorFilterLabel)}
            </label>
            <NativeSelectField
              id="activity-actor"
              name="activity-actor"
              className="mt-1"
              size="sm"
              value={staged.actor === null ? '' : actorToken(staged.actor)}
              placeholder={intl.formatMessage(messages.allActors)}
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
              {intl.formatMessage(messages.outcomeFilterLabel)}
            </label>
            <NativeSelectField
              id="activity-outcome"
              name="activity-outcome"
              className="mt-1"
              size="sm"
              value={staged.outcome}
              placeholder={intl.formatMessage(messages.allOutcomes)}
              options={AUDIT_OUTCOMES.map((outcome) => ({
                value: outcome,
                label: intl.formatMessage(OUTCOME_LABELS[outcome]),
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
              {intl.formatMessage(messages.fromDate)}
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
              {intl.formatMessage(messages.toDate)}
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
              {intl.formatMessage(messages.applyFilters)}
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
              {intl.formatMessage(messages.clearFilters)}
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
              {intl.formatMessage(messages.filterOptionsTruncated)}
            </Paragraph>
          )}
        </form>
      </Surface>

      <Paragraph className="sr-only" role="status" margin="none">
        {activity.isPending
          ? intl.formatMessage(messages.loading)
          : intl.formatMessage(messages.eventsShown, { count: items.length })}
      </Paragraph>

      {activity.isPending && (
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <Paragraph margin="none">
            {intl.formatMessage(messages.loading)}
          </Paragraph>
        </div>
      )}

      {activity.isError && !isForbidden(activity.error) && (
        <Alert variant="destructive">
          {intl.formatMessage(messages.loadFailed)}
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void activity.refetch()}
          >
            {intl.formatMessage(messages.retry)}
          </Button>
        </Alert>
      )}

      {activity.isSuccess && items.length === 0 && (
        <Alert>
          {hasActiveFilter(applied)
            ? intl.formatMessage(messages.noMatches)
            : intl.formatMessage(messages.noneRecorded)}
        </Alert>
      )}

      {items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{intl.formatMessage(messages.whenColumn)}</TableHead>
                <TableHead>
                  {intl.formatMessage(messages.actorColumn)}
                </TableHead>
                <TableHead>
                  {intl.formatMessage(messages.actionColumn)}
                </TableHead>
                <TableHead>
                  {intl.formatMessage(messages.subjectColumn)}
                </TableHead>
                <TableHead>
                  {intl.formatMessage(messages.outcomeColumn)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((event) => {
                const target = event.subject ?? event.resource;
                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      <time dateTime={event.occurredAt.toISOString()}>
                        {intl.formatDate(event.occurredAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </TableCell>
                    <TableCell>{actorText(intl, event.actor)}</TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => openDetail(event)}
                      >
                        {event.title}
                      </Button>
                      {!event.rendered && (
                        <Badge className="ms-2" variant="outline">
                          {intl.formatMessage(messages.unrecognizedEvent)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{target?.label ?? target?.id ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_BADGE_VARIANTS[event.outcome]}>
                        {intl.formatMessage(OUTCOME_LABELS[event.outcome])}
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
                {activity.isFetchingNextPage
                  ? intl.formatMessage(messages.loadingMore)
                  : intl.formatMessage(messages.loadMore)}
              </Button>
            </div>
          ) : (
            <Paragraph className="text-sm opacity-70" margin="none">
              {intl.formatMessage(messages.beginning)}
            </Paragraph>
          )}
        </>
      )}
    </div>
  );
}

function ActivityEventDetail(props: { teamId: string; eventId: string }) {
  const intl = useAppIntl();
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
        <Paragraph margin="none">
          {intl.formatMessage(messages.loadingEvent)}
        </Paragraph>
      </div>
    );
  }

  if (detail.isError) {
    return (
      <Alert variant="destructive">
        {intl.formatMessage(messages.eventLoadFailed)}
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={() => void detail.refetch()}
        >
          {intl.formatMessage(messages.retry)}
        </Button>
      </Alert>
    );
  }

  const event = detail.data;
  const detailEntries = Object.entries(event.details);
  const fields: { label: string; value: string }[] = [
    {
      label: intl.formatMessage(messages.detailTime),
      value: intl.formatDate(event.occurredAt, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    },
    {
      label: intl.formatMessage(messages.detailTimeUtc),
      value: event.occurredAt.toISOString(),
    },
    {
      label: intl.formatMessage(messages.detailActor),
      value: actorText(intl, event.actor),
    },
    ...(event.actor.id === null
      ? []
      : [
          {
            label: intl.formatMessage(messages.detailActorId),
            value: event.actor.id,
          },
        ]),
    ...(event.subject
      ? [
          {
            label: intl.formatMessage(messages.detailSubject),
            value: intl.formatMessage(messages.entityWithType, {
              name: event.subject.label ?? event.subject.id ?? '',
              type: event.subject.type,
            }),
          },
        ]
      : []),
    ...(event.resource
      ? [
          {
            label: intl.formatMessage(messages.detailResource),
            value: intl.formatMessage(messages.entityWithType, {
              name: event.resource.label ?? event.resource.id ?? '',
              type: event.resource.type,
            }),
          },
        ]
      : []),
    {
      label: intl.formatMessage(messages.detailOutcome),
      value: intl.formatMessage(OUTCOME_LABELS[event.outcome]),
    },
    {
      label: intl.formatMessage(messages.detailCategory),
      value: intl.formatMessage(CATEGORY_LABELS[event.category]),
    },
    {
      label: intl.formatMessage(messages.detailEventType),
      value: intl.formatMessage(messages.eventTypeVersion, {
        eventType: event.eventType,
        version: String(event.eventVersion),
      }),
    },
    { label: intl.formatMessage(messages.detailTeam), value: event.teamLabel },
    {
      label: intl.formatMessage(messages.detailSequence),
      value: event.sequence,
    },
    {
      label: intl.formatMessage(messages.detailRequestId),
      value: event.requestId,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {!event.rendered && (
        <Alert>{intl.formatMessage(messages.unrecognizedDetail)}</Alert>
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
        <section aria-label={intl.formatMessage(messages.detailsSectionLabel)}>
          <Heading level="h3" margin="none">
            {intl.formatMessage(messages.detailsHeading)}
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
