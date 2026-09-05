import { APIError } from 'better-auth/api';
import type { BetterAuthOptions } from 'better-auth/types';
import type pg from 'pg';

/** One creation gate covers magic-link verification and every OAuth callback. */
export function selfHostedEnrollmentHooks(
  pool: pg.Pool,
): NonNullable<BetterAuthOptions['databaseHooks']> {
  return {
    user: {
      create: {
        before: async (user) => {
          // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare -- the provider trust boundary requires literal boolean true
          if (user.emailVerified === true) {
            const result = await pool.query<{ invited: boolean }>(
              `
              SELECT EXISTS (
                SELECT 1 FROM team_invitations
                WHERE lower(email) = lower($1) AND status = 'pending'
                  AND expires_at > statement_timestamp()
              ) AS invited
            `,
              [user.email.trim()],
            );
            if (result.rows[0]?.invited) return;
          }
          throw new APIError('FORBIDDEN', {
            code: 'INVITATION_REQUIRED',
            message:
              'A current invitation and a verified email address are required to create an account.',
          });
        },
      },
    },
  };
}
