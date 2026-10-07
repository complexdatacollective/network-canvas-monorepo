/**
 * The session could not be determined at all: the request never completed, or
 * `/api/auth/*` answered with something other than the supported no-database
 * degradation. The router's `defaultErrorComponent` recognises it and explains
 * the outage, rather than treating "we could not ask" as "you are signed out".
 */
export class ServerUnreachableError extends Error {
  constructor() {
    super('The server could not be reached.');
    this.name = 'ServerUnreachableError';
  }
}
