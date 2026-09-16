import { Schema } from 'effect';

import { Email, NonBlankString } from './primitives.ts';

// First-run bootstrap (#1909): the one command an instance with no owner will
// accept, and the only thing it tells the caller afterwards.
//
// Input type == output type for every boundary schema here: no transforms, no
// coercions, no defaults.

/** The instance's own name, as `/setup` stores it. */
export const InstanceName = NonBlankString(120, 'Instance name');

/**
 * What `/setup` submits: the token from the schema step, the instance's name,
 * and the first owner's account.
 *
 * The password bound is better-auth's own minimum (8) and its maximum (128);
 * refusing here means the form can say so rather than the provider refusing
 * an account this procedure has already decided to create.
 */
export const CompleteSetupInput = Schema.Struct({
  token: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  instanceName: InstanceName,
  owner: Schema.Struct({
    name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(320)),
    email: Email,
    password: Schema.String.check(
      Schema.isMinLength(8),
      Schema.isMaxLength(128),
    ),
  }),
});

export const CompleteSetupResult = Schema.Struct({
  instanceName: InstanceName,
  /**
   * True when the response also carried the new owner's session cookie.
   *
   * New relative to today's result. The cookie itself never enters the body —
   * it is set on the response — so a flag is all the client can learn, and it
   * is what decides whether the shell continues into the signed-in app or
   * sends the new owner to sign in.
   */
  signedIn: Schema.Boolean,
});

/**
 * How the setup command refuses, for the handler's own use. It is not on any
 * procedure's error channel: `setup.complete` declares the shared
 * `Unauthorized`, `NotFound` and `Conflict` instead, so a caller reads one
 * error vocabulary across every surface.
 */
export class SetupCommandError extends Schema.TaggedError<SetupCommandError>()(
  'SetupCommandError',
  {
    reason: Schema.Literals(['closed', 'unauthorized', 'emailTaken']),
  },
) {}
