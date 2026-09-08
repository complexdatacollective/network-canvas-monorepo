import type { StudyParticipationMode, StudyState } from '@codaco/studio-rpc';
import type { TenantDb } from '@codaco/studio-sync/tenant';

/**
 * Reads over the study tier (#1262). Writes live in `commands.ts`, because
 * every one of them is audited and role-gated.
 *
 * Every statement here is a single tenant-stamped SELECT: the `studies`
 * policy already refuses another team's rows, and the explicit `team_id`
 * predicate leads the team-first index the schema declares for exactly these
 * lookups.
 */

export type StudyRow = {
  id: string;
  name: string;
  state: StudyState;
  participationMode: StudyParticipationMode;
  protocolId: string | null;
  createdAt: Date;
  waveCount: number;
  participantCount: number;
};

export type StudyDetailRow = StudyRow & {
  protocolDraftId: string | null;
};

/**
 * Which studies of the team the caller may see, per #1257's starter matrix:
 * a team Admin or Owner sees all of them, and a team Member sees only the
 * studies they hold a grant on. The grant probe is the query
 * `study_role_grants_team_id_user_id_idx` exists for.
 */
export type StudyVisibility = {
  actorUserId: string;
  /** True for a team Admin or Owner. */
  seesEveryStudy: boolean;
};

type StudyResultRow = {
  id: string;
  name: string;
  state: StudyState;
  participation_mode: StudyParticipationMode;
  protocol_id: string | null;
  created_at: Date;
  wave_count: number;
  participant_count: number;
};

// Counted per study rather than joined-and-grouped: a study with no waves and
// no participants must still list, and both counts are served by the
// team-and-study indexes their tables already carry.
const STUDY_COLUMNS = `s.id, s.name, s.state, s.participation_mode,
         s.protocol_id, s.created_at,
         (SELECT count(*) FROM study_waves w
           WHERE w.team_id = s.team_id AND w.study_id = s.id)::int
           AS wave_count,
         (SELECT count(*) FROM participants p
           WHERE p.team_id = s.team_id AND p.study_id = s.id)::int
           AS participant_count`;

/**
 * #1257's visibility rule as one SQL predicate, so every read that must obey
 * it is written from this source rather than from a copy: the study tier's own
 * reads below, and the protocol tier's, which reaches a protocol line only
 * through a study the caller can see (`protocol/store.ts`).
 *
 * Positional by convention — every query embedding it binds the same three
 * values in the same order: `$1` the team, `$2` the caller's team role reduced
 * to one boolean (`seesEveryTeamStudy`), `$3` their user id. A Member's
 * visibility is the EXISTS, which is also what keeps a study nobody granted
 * them out of `studies.get`. `alias` names the `studies` row being asked about.
 */
export function studyVisibleToCallerSql(alias: string): string {
  return `($2::boolean OR EXISTS (
           SELECT 1 FROM study_role_grants g
           WHERE g.team_id = ${alias}.team_id
             AND g.study_id = ${alias}.id
             AND g.user_id = $3))`;
}

const VISIBLE_TO_CALLER = studyVisibleToCallerSql('s');

function toStudyRow(row: StudyResultRow): StudyRow {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    participationMode: row.participation_mode,
    protocolId: row.protocol_id,
    createdAt: row.created_at,
    waveCount: row.wave_count,
    participantCount: row.participant_count,
  };
}

export class StudyStore {
  private readonly db: TenantDb;

  constructor(db: TenantDb) {
    this.db = db;
  }

  /** Newest first, the order the composite index is declared in. */
  async listStudies(visibility: StudyVisibility): Promise<StudyRow[]> {
    const result = await this.db.query(
      `SELECT ${STUDY_COLUMNS}
       FROM studies s
       WHERE s.team_id = $1 AND ${VISIBLE_TO_CALLER}
       ORDER BY s.created_at DESC, s.id DESC`,
      [this.db.teamId, visibility.seesEveryStudy, visibility.actorUserId],
    );
    return (result.rows as StudyResultRow[]).map(toStudyRow);
  }

  /**
   * One study and the draft the editor opens for it. Null when the caller may
   * not see it, which callers turn into the same refusal as a study that does
   * not exist — the two are indistinguishable by construction (§6.3).
   */
  async getStudy(
    studyId: string,
    visibility: StudyVisibility,
  ): Promise<StudyDetailRow | null> {
    const result = await this.db.query(
      `SELECT ${STUDY_COLUMNS}, d.draft_id
       FROM studies s
       LEFT JOIN LATERAL (
         SELECT pd.draft_id
         FROM protocol_drafts pd
         WHERE pd.protocol_id = s.protocol_id AND pd.team_id = s.team_id
         ORDER BY pd.created_at DESC, pd.draft_id
         LIMIT 1
       ) d ON true
       WHERE s.team_id = $1 AND s.id = $4 AND ${VISIBLE_TO_CALLER}`,
      [
        this.db.teamId,
        visibility.seesEveryStudy,
        visibility.actorUserId,
        studyId,
      ],
    );
    const row = result.rows[0] as
      | (StudyResultRow & { draft_id: string | null })
      | undefined;
    if (!row) return null;
    return { ...toStudyRow(row), protocolDraftId: row.draft_id };
  }
}
