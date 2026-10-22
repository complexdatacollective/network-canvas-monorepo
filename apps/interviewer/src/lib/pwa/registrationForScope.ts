/**
 * The registration whose scope is exactly `scope` (a path such as `/v8/`),
 * if there is one. Not `getRegistration(scope)`: that answers with the closest
 * enclosing registration, and Chromium passes over a registration whose only
 * worker is still installing, so during Interviewer 8's first download it
 * answers `/v8/` with this app's own `/` registration.
 */
export async function getRegistrationForScope(
  container: ServiceWorkerContainer,
  scope: string,
): Promise<ServiceWorkerRegistration | undefined> {
  return (await container.getRegistrations()).find(
    (registration) => new URL(registration.scope).pathname === scope,
  );
}
