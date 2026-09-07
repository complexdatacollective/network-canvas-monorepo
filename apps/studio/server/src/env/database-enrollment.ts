import { validateRoleNames } from '@codaco/studio-sync/role-bootstrap';

/** Parse explicitly configured enrollment; never infer it from a database URL. */
export function parseDatabaseAllowedLogins(
  source: string | undefined,
): string[] {
  try {
    const value: unknown = JSON.parse(source ?? '');
    if (!Array.isArray(value)) throw new Error();
    const logins: unknown[] = [...value];
    if (!logins.every((login): login is string => typeof login === 'string'))
      throw new Error();
    validateRoleNames(logins);
    return logins;
  } catch {
    throw new Error(
      'STUDIO_DATABASE_ALLOWED_LOGINS is required as a JSON array of this deployment’s login names.',
    );
  }
}
