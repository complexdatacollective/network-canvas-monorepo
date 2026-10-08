import { Schema } from 'effect';

import { Email, NonBlankString } from './primitives.ts';

export const InstanceName = NonBlankString(120, 'Instance name');

export const CompleteSetupInput = Schema.Struct({
  token: Schema.RedactedFromValue(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  ),
  instanceName: InstanceName,
  owner: Schema.Struct({
    name: Schema.RedactedFromValue(
      Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(320)),
    ),
    email: Email,
    password: Schema.RedactedFromValue(
      Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(128)),
    ),
  }),
});

export const CompleteSetupResult = Schema.Struct({
  instanceName: InstanceName,
  signedIn: Schema.Boolean,
});

export class SetupCommandError extends Schema.TaggedError<SetupCommandError>()(
  'SetupCommandError',
  {
    reason: Schema.Literals(['closed', 'unauthorized', 'emailTaken']),
  },
) {}
