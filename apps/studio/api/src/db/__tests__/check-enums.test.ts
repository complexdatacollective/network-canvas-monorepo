import { is } from 'drizzle-orm';
import { getTableConfig, PgDialect, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as account from '@codaco/studio-contract/schema/account';
import * as audit from '@codaco/studio-contract/schema/audit';
import * as ids from '@codaco/studio-contract/schema/ids';
import * as participant from '@codaco/studio-contract/schema/participant';
import * as primitives from '@codaco/studio-contract/schema/primitives';
import * as problem from '@codaco/studio-contract/schema/problem';
import * as protocol from '@codaco/studio-contract/schema/protocol';
import * as setup from '@codaco/studio-contract/schema/setup';
import * as status from '@codaco/studio-contract/schema/status';
import * as study from '@codaco/studio-contract/schema/study';
import * as team from '@codaco/studio-contract/schema/team';

import { SCHEMA } from '../schema.ts';

type EnumCheck = { name: string; column: string; values: string[] };

const IN_LIST = /"(\w+)"\."(\w+)" IN \(((?:'[^']*'(?:, )?)+)\)/g;

function enumChecks(): EnumCheck[] {
  const dialect = new PgDialect();
  return Object.values(SCHEMA).flatMap((value) => {
    if (!is(value, PgTable)) return [];
    const config = getTableConfig(value);
    return config.checks.flatMap((check) =>
      [...dialect.sqlToQuery(check.value).sql.matchAll(IN_LIST)].map(
        (match) => ({
          name: check.name,
          column: `${match[1]}.${match[2]}`,
          values: [...(match[3] ?? '').matchAll(/'([^']*)'/g)].map(
            (quoted) => quoted[1] ?? '',
          ),
        }),
      ),
    );
  });
}

const TIED: Record<string, readonly string[]> = {
  studies_state_check: study.STUDY_STATES,
  studies_participation_mode_check: study.STUDY_PARTICIPATION_MODES,
  audit_events_category_check: audit.AUDIT_CATEGORIES,
  audit_events_outcome_check: audit.AUDIT_OUTCOMES,
  audit_events_actor_kind_check: audit.AUDIT_ACTOR_KINDS,
  team_invitation_deliveries_role_check: team.TEAM_ROLES,
  interview_sessions_status_check: participant.PARTICIPANT_SESSION_STATUSES,
};

const DECLARED_ONLY_HERE = new Set([
  'protocol_events_kind_check',
  'protocol_write_receipts_operation_check',
  'protocol_connections_kind_check',
  'protocol_connections_mode_check',
  'protocol_staged_resources_kind_check',
  'assets_media_class_check',
  'assets_origin_check',
  'asset_references_referrer_kind_check',
  'studies_wave_progression_check',
  'interview_sessions_delivery_mode_check',
  'interview_links_kind_check',
  'study_role_grants_role_check',
  'consent_documents_state_check',
  'participant_consents_method_check',
  'participant_consents_withdrawn_by_check',
  'study_schedules_state_check',
  'study_schedules_anchor_check',
  'study_schedules_recurrence_check',
  'study_schedules_catch_up_policy_check',
  'schedule_occurrences_state_check',
  'message_templates_kind_check',
  'message_templates_channel_check',
  'message_templates_state_check',
  'message_deliveries_kind_check',
  'message_deliveries_channel_check',
  'message_deliveries_provider_check',
  'message_delivery_events_kind_check',
  'message_delivery_events_provider_check',
  'participant_contact_optouts_channel_check',
  'participant_contact_optouts_source_check',
  'api_tokens_scope_kind_check',
  'api_tokens_access_level_check',
  'templates_kind_check',
  'templates_license_check',
  'templates_state_check',
  'webhook_subscriptions_state_check',
  'experiments_surface_check',
  'experiments_state_check',
  'experiment_assignments_subject_kind_check',
  'feedback_reports_reporter_kind_check',
  'feedback_reports_kind_check',
  'feedback_reports_state_check',
  'audit_export_jobs_status_check',
  'audit_export_jobs_actor_kind_check',
]);

const isStringTuple = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === 'string');

const CONTRACT_TUPLES = Object.entries({
  account,
  audit,
  ids,
  participant,
  primitives,
  problem,
  protocol,
  setup,
  status,
  study,
  team,
}).flatMap(([module, exports]) =>
  Object.entries(exports)
    .filter((entry): entry is [string, readonly string[]] =>
      isStringTuple(entry[1]),
    )
    .map(([name, values]) => ({ name: `${module}.${name}`, values })),
);

const sameSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  new Set([...left, ...right]).size === new Set(left).size;

describe('the hand-written enum CHECK constraints', () => {
  const checks = enumChecks();

  it('finds the constraints it is meant to judge', () => {
    expect(checks.map((check) => check.name)).toContain('studies_state_check');
    expect(checks.length).toBeGreaterThanOrEqual(
      Object.keys(TIED).length + DECLARED_ONLY_HERE.size,
    );
  });

  it('spell exactly the values of the constant each is tied to', () => {
    for (const [name, constant] of Object.entries(TIED)) {
      const check = checks.find((candidate) => candidate.name === name);
      expect(check?.values, name).toEqual([...constant]);
    }
  });

  it('are each either tied to a constant or declared nowhere else', () => {
    expect(
      checks
        .map((check) => check.name)
        .filter((name) => !(name in TIED) && !DECLARED_ONLY_HERE.has(name)),
    ).toEqual([]);
    expect(
      [...DECLARED_ONLY_HERE, ...Object.keys(TIED)].filter(
        (name) => !checks.some((check) => check.name === name),
      ),
    ).toEqual([]);
  });

  it('leave untied no constraint that spells a contract tuple', () => {
    expect(CONTRACT_TUPLES.map((tuple) => tuple.name)).toContain(
      'team.TEAM_ROLES',
    );
    expect(
      checks
        .filter((check) => !(check.name in TIED))
        .flatMap((check) =>
          CONTRACT_TUPLES.filter((tuple) =>
            sameSet(tuple.values, check.values),
          ).map((tuple) => `${check.name} spells ${tuple.name}`),
        ),
    ).toEqual([]);
  });
});
