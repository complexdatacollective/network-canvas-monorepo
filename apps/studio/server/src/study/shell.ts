import type pg from 'pg';

import {
  STUDY_LIST_CAP,
  type StudyShell,
  TEAM_ROLES,
  type TeamRole,
} from '@codaco/studio-rpc';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  AUDIT_PERMISSIONS,
  rolesGrantAuditPermission,
} from '../audit/permissions.ts';
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
import type { AuthService, Principal } from '../auth/service.ts';
import { tryParseRoles } from '../team/roles.ts';

// The study shell's tenancy resolver (app-shell design §6.3).
//
// `study.shell` is the only tenant-scoped procedure whose input names no team:
// a cold deep link to /study/$studyId has none to send, and a teamId supplied
// by the browser would be unvalidatable — the same reason invitation
// acceptance takes none (schemas.ts). So the server resolves it:
//
//   1. read the caller's own membership team ids (policy-free, one indexed
//      read, already made before any pin by requireTeam's getMembership);
//   2. probe those teams, the session's active team first so the common case
//      is one probe, each through a TenantDb pinned to that team;
//   3. no hit in any of them → the caller cannot reach this study.
//
// THE RULE THIS HOLDS: before a TenantDb is pinned, the resolver reads only
// the caller's membership rows — never a study name, state, count, permission
// or team name. Every field in the response below is read after pinning, under
// that team's row-level security.
//
// A miss returns null, which the RPC router turns into FORBIDDEN — the same
// answer a study in another team gets, and the same posture requireTeam takes
// for a non-member and an unknown team. Because the search space is exactly
// the caller's own teams, "does not exist" and "not yours" are
// indistinguishable by construction; no special case closes the oracle.
//
// Rejected in the design, in writing: a policy-free study_directory(study_id,
// team_id) index would resolve the tenant in one unpinned statement, but it
// carries a team_id and is not an auth table, so db/__tests__/rls.test.ts's
// derived tenant-table set fails on it by design.

/**
 * The study-shaped entity is `protocols` until the studies table lands
 * (#1262). Every study identity, name, list and count below reads through the
 * protocol ownership chain, so the table swap is a change to these four
 * statements and nothing above them.
 */
const STUDY_TABLE = 'protocols';

type StudyRow = { id: string; name: string };
type TeamRow = { name: string; role: string };
type StudyListRow = { id: string; name: string; created_at: Date };
type CountRow = { versions: number };

/**
 * The single role the shell labels the researcher with. Better Auth stores a
 * member's roles as one comma-separated string, so the stored value is a set;
 * TEAM_ROLES is already in descending precedence, making the first match the
 * strongest. A value that parses to no known role falls back to the least
 * privileged label, which is the same direction `permissions` fails in: an
 * unrecognised role grants nothing.
 */
function primaryRole(roles: readonly TeamRole[]): TeamRole {
  return TEAM_ROLES.find((candidate) => roles.includes(candidate)) ?? 'member';
}

/**
 * The capabilities this researcher actually holds in this team, which today is
 * the audit pair the server enforces (audit/permissions.ts). #1257 replaces
 * the built-in role mapping with a configurable policy; this list is derived
 * from the same function the audit reads authorize against, so it cannot claim
 * a capability the server would refuse.
 */
function effectivePermissions(roles: readonly TeamRole[]): string[] {
  return AUDIT_PERMISSIONS.filter((permission) =>
    rolesGrantAuditPermission(roles, permission),
  );
}

/** Absent, not zero: an empty area shows no count at all. */
function countsFrom(versions: number): StudyShell['counts'] {
  return versions > 0 ? { versions } : {};
}

/**
 * The team's study list as the header chip renders it: capped, most recent
 * first, and always containing the study being viewed. The pinned first sort
 * key is what guarantees the last part — a study older than the cap would
 * otherwise be missing from the menu that is meant to show where you are.
 * `hasMore` is read from the same window (cap + 1 rows), so the chip's
 * visibility and its contents cannot disagree.
 */
function orderStudyList(rows: StudyListRow[]): StudyShell['teamStudies'] {
  const hasMore = rows.length > STUDY_LIST_CAP;
  const items = rows.slice(0, STUDY_LIST_CAP).toSorted((a, b) => {
    const byRecency = b.created_at.getTime() - a.created_at.getTime();
    if (byRecency !== 0) return byRecency;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return {
    items: items.map((row) => ({ id: row.id, name: row.name })),
    hasMore,
  };
}

/**
 * Everything the shell reports, read inside one team-pinned transaction so the
 * study, the list it appears in and the counts beside it are one snapshot.
 * Returns null when this team does not hold the study, which is the probe's
 * only signal — nothing else has been read at that point.
 */
async function readShellFromTeam(
  tenantDb: TenantDb,
  teamId: string,
  input: { studyId: string; userId: string },
): Promise<StudyShell | null> {
  return runNoAuditTenantTransaction(
    tenantDb,
    'study.shell',
    async (client) => {
      const found = await client.query(
        `SELECT id, name FROM ${STUDY_TABLE} WHERE id = $1 AND team_id = $2`,
        [input.studyId, teamId],
      );
      const study = found.rows[0] as StudyRow | undefined;
      if (study === undefined) return null;

      // The caller's standing, read here rather than carried in from the
      // unpinned membership read above: every field in the response is read
      // after the pin.
      const membership = await client.query(
        `SELECT t.name, m.role
         FROM teams t
         JOIN team_members m ON m.team_id = t.id AND m.user_id = $2
         WHERE t.id = $1`,
        [teamId, input.userId],
      );
      const team = membership.rows[0] as TeamRow | undefined;
      // The membership that selected this team is gone — it was revoked
      // between the two reads. Treated as a miss so the caller gets the same
      // refusal a non-member gets, rather than a shell built from a
      // membership that no longer exists.
      if (team === undefined) return null;
      const roles = tryParseRoles(team.role) ?? [];

      const listed = await client.query(
        `SELECT id, name, created_at FROM ${STUDY_TABLE}
         WHERE team_id = $1
         ORDER BY (id = $2) DESC, created_at DESC, id
         LIMIT $3`,
        [teamId, input.studyId, STUDY_LIST_CAP + 1],
      );

      const counted = await client.query(
        `SELECT count(*)::int AS versions FROM protocol_versions
         WHERE protocol_id = $1 AND team_id = $2`,
        [input.studyId, teamId],
      );

      return {
        study: { id: study.id, name: study.name },
        team: { id: teamId, name: team.name, role: primaryRole(roles) },
        permissions: effectivePermissions(roles),
        teamStudies: orderStudyList(listed.rows as StudyListRow[]),
        counts: countsFrom((counted.rows[0] as CountRow).versions),
      };
    },
  );
}

/**
 * The caller's teams with the session's active team first, so the common case
 * — a researcher working in the team they were last in — is one probe. Built
 * by partition rather than a comparator so the remaining order is exactly the
 * order the memberships came in, with no reliance on sort stability.
 */
function probeOrder(
  teamIds: readonly string[],
  activeTeamId: string | null,
): string[] {
  if (activeTeamId === null) return [...teamIds];
  return [
    ...teamIds.filter((teamId) => teamId === activeTeamId),
    ...teamIds.filter((teamId) => teamId !== activeTeamId),
  ];
}

export async function readStudyShell(
  deps: { auth: AuthService; pool: pg.Pool },
  principal: Principal,
  input: { studyId: string },
): Promise<StudyShell | null> {
  const teamIds = await deps.auth.listMemberTeamIds(principal.userId);
  for (const teamId of probeOrder(teamIds, principal.activeTeamId)) {
    const shell = await readShellFromTeam(
      createTenantDb(deps.pool, teamId),
      teamId,
      { studyId: input.studyId, userId: principal.userId },
    );
    if (shell !== null) return shell;
  }
  return null;
}
