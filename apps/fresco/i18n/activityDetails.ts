import { z } from 'zod/mini';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { formatPasskeyName } from '~/i18n/passkeyNames';

const activityDetailMessages = defineMessages({
  userLogin: {
    id: 'fresco.activity.detail.userLogin',
    defaultMessage: 'User {username} logged in.',
    description:
      'A successful researcher sign-in. User-controlled values are literal data, not translated copy.',
  },
  recoveryLogin: {
    id: 'fresco.activity.detail.recoveryLogin',
    defaultMessage: 'User {username} logged in with a recovery code.',
    description:
      'Sign-in using a recovery code. User-controlled values are literal data, not translated copy.',
  },
  userCreated: {
    id: 'fresco.activity.detail.userCreated',
    defaultMessage: 'User {username} created user {target}.',
    description:
      'An administrator creates another researcher account. User-controlled values are literal data, not translated copy.',
  },
  usersDeleted: {
    id: 'fresco.activity.detail.usersDeleted',
    defaultMessage:
      'User {username} deleted {count, plural, one {user} other {users}}: {users}.',
    description:
      'Accounts deleted by a researcher; users is a locale-formatted list. User-controlled values are literal data, not translated copy.',
  },
  passwordChanged: {
    id: 'fresco.activity.detail.passwordChanged',
    defaultMessage: 'User {username} changed their password.',
    description:
      'A researcher changes their own password. User-controlled values are literal data, not translated copy.',
  },
  protocolInstalled: {
    id: 'fresco.activity.detail.protocolInstalled',
    defaultMessage: 'User {username} installed protocol “{protocol}”.',
    description:
      'A protocol was imported; protocol is its original file/name. User-controlled values are literal data, not translated copy.',
  },
  protocolUninstalled: {
    id: 'fresco.activity.detail.protocolUninstalled',
    defaultMessage: 'User {username} uninstalled protocol “{protocol}”.',
    description:
      'A protocol was removed; protocol is its original file/name. User-controlled values are literal data, not translated copy.',
  },
  interviewCompleted: {
    id: 'fresco.activity.detail.interviewCompleted',
    defaultMessage: 'Participant “{participant}” completed an interview.',
    description:
      'A participant completed their interview; participant is their stable display value. User-controlled values are literal data, not translated copy.',
  },
  interviewStarted: {
    id: 'fresco.activity.detail.interviewStarted',
    defaultMessage: 'Participant “{participant}” started an interview.',
    description:
      'A participant started an interview; participant is their stable display value. User-controlled values are literal data, not translated copy.',
  },
  apiTokenCreated: {
    id: 'fresco.activity.detail.apiTokenCreated',
    defaultMessage:
      'User {username} created {descriptionMode, select, named {API token “{token}”} other {an untitled API token}}.',
    description:
      'API token creation; token is an optional user-authored description, never the secret. User-controlled values are literal data, not translated copy.',
  },
  apiTokenUpdated: {
    id: 'fresco.activity.detail.apiTokenUpdated',
    defaultMessage: 'User {username} updated API token {token}.',
    description:
      'API token update; token is the record identifier, never the secret. User-controlled values are literal data, not translated copy.',
  },
  apiTokenDeleted: {
    id: 'fresco.activity.detail.apiTokenDeleted',
    defaultMessage: 'User {username} deleted API token {token}.',
    description:
      'API token deletion; token is the record identifier, never the secret. User-controlled values are literal data, not translated copy.',
  },
  syntheticDeleted: {
    id: 'fresco.activity.detail.syntheticDeleted',
    defaultMessage:
      'User {username} deleted {interviews, plural, one {# synthetic interview} other {# synthetic interviews}} and {participants, plural, one {# test participant} other {# test participants}}.',
    description:
      'Removal of generated test data; both counts are independent. User-controlled values are literal data, not translated copy.',
  },
  syntheticGenerated: {
    id: 'fresco.activity.detail.syntheticGenerated',
    defaultMessage:
      'User {username} generated {count, plural, one {# synthetic interview} other {# synthetic interviews}} for protocol “{protocol}”.',
    description:
      'Generated test interviews for a named protocol. User-controlled values are literal data, not translated copy.',
  },
  passkeyRegistered: {
    id: 'fresco.activity.detail.passkeyRegistered',
    defaultMessage: 'User {username} registered a passkey ({passkey}).',
    description:
      'A passkey is registered; passkey is its stored friendly name. User-controlled values are literal data, not translated copy.',
  },
  accountCreatedWithPasskey: {
    id: 'fresco.activity.detail.accountCreatedWithPasskey',
    defaultMessage:
      'User {username} created an account with a passkey ({passkey}).',
    description:
      'Initial account creation with a passkey. User-controlled values are literal data, not translated copy.',
  },
  passkeyRemoved: {
    id: 'fresco.activity.detail.passkeyRemoved',
    defaultMessage:
      'User {username} removed {nameMode, select, named {passkey “{passkey}”} other {a passkey}}.',
    description:
      'A passkey is removed, with an optional stored friendly name. User-controlled values are literal data, not translated copy.',
  },
  authReset: {
    id: 'fresco.activity.detail.authReset',
    defaultMessage: 'User {username} reset authentication for {target}.',
    description:
      'An administrator resets another account’s authentication. User-controlled values are literal data, not translated copy.',
  },
  switchedToPasskey: {
    id: 'fresco.activity.detail.switchedToPasskey',
    defaultMessage:
      'User {username} switched to passkey-only authentication ({passkey}).',
    description:
      'A researcher switches to using a passkey only. User-controlled values are literal data, not translated copy.',
  },
  switchedToPassword: {
    id: 'fresco.activity.detail.switchedToPassword',
    defaultMessage: 'User {username} switched to password authentication.',
    description:
      'A researcher switches to password authentication. User-controlled values are literal data, not translated copy.',
  },
  participantsRemoved: {
    id: 'fresco.activity.detail.participantsRemoved',
    defaultMessage:
      'User {username} removed {count, plural, one {# participant} other {# participants}}.',
    description:
      'Participants removed in one action. User-controlled values are literal data, not translated copy.',
  },
  participantsAdded: {
    id: 'fresco.activity.detail.participantsAdded',
    defaultMessage:
      'User {username} added {count, plural, one {# participant} other {# participants}}.',
    description:
      'Participants added in one action or CSV import. User-controlled values are literal data, not translated copy.',
  },
  interviewsDeleted: {
    id: 'fresco.activity.detail.interviewsDeleted',
    defaultMessage:
      'User {username} deleted {count, plural, one {# interview} other {# interviews}}.',
    description:
      'Interviews deleted in one action. User-controlled values are literal data, not translated copy.',
  },
  dataExported: {
    id: 'fresco.activity.detail.dataExported',
    defaultMessage:
      'User {username} exported data for {count, plural, one {# interview} other {# interviews}}.',
    description:
      'A successfully committed interview export. User-controlled values are literal data, not translated copy.',
  },
  settingChanged: {
    id: 'fresco.activity.detail.settingChanged',
    defaultMessage: 'User {username} changed “{setting}” to “{value}”.',
    description:
      'A setting changes; setting is a stable configuration key, value preserves existing secret redaction. User-controlled values are literal data, not translated copy.',
  },
  twoFactorEnabled: {
    id: 'fresco.activity.detail.twoFactorEnabled',
    defaultMessage: 'User {username} enabled two-factor authentication.',
    description:
      'A researcher enables two-factor authentication. User-controlled values are literal data, not translated copy.',
  },
  twoFactorDisabled: {
    id: 'fresco.activity.detail.twoFactorDisabled',
    defaultMessage: 'User {username} disabled two-factor authentication.',
    description:
      'A researcher disables two-factor authentication. User-controlled values are literal data, not translated copy.',
  },
  recoveryCodesRegenerated: {
    id: 'fresco.activity.detail.recoveryCodesRegenerated',
    defaultMessage: 'User {username} regenerated recovery codes.',
    description:
      'A researcher generates replacement recovery codes. User-controlled values are literal data, not translated copy.',
  },
  twoFactorReset: {
    id: 'fresco.activity.detail.twoFactorReset',
    defaultMessage:
      'User {username} reset two-factor authentication for {target}.',
    description:
      'An administrator resets another account’s two-factor authentication. User-controlled values are literal data, not translated copy.',
  },
});

const activityValueSchemas = {
  userLogin: z.strictObject({ username: z.string() }),
  recoveryLogin: z.strictObject({ username: z.string() }),
  userCreated: z.strictObject({ username: z.string(), target: z.string() }),
  usersDeleted: z.strictObject({
    username: z.string(),
    count: z.number(),
    users: z.array(z.string()),
  }),
  passwordChanged: z.strictObject({ username: z.string() }),
  protocolInstalled: z.strictObject({
    username: z.string(),
    protocol: z.string(),
  }),
  protocolUninstalled: z.strictObject({
    username: z.string(),
    protocol: z.string(),
  }),
  interviewCompleted: z.strictObject({ participant: z.string() }),
  interviewStarted: z.strictObject({ participant: z.string() }),
  apiTokenCreated: z.strictObject({
    username: z.string(),
    descriptionMode: z.string(),
    token: z.string(),
  }),
  apiTokenUpdated: z.strictObject({ username: z.string(), token: z.string() }),
  apiTokenDeleted: z.strictObject({ username: z.string(), token: z.string() }),
  syntheticDeleted: z.strictObject({
    username: z.string(),
    interviews: z.number(),
    participants: z.number(),
  }),
  syntheticGenerated: z.strictObject({
    username: z.string(),
    count: z.number(),
    protocol: z.string(),
  }),
  passkeyRegistered: z.strictObject({
    username: z.string(),
    passkey: z.string(),
    passkeyDeviceType: z.optional(z.enum(['multiDevice', 'singleDevice'])),
  }),
  accountCreatedWithPasskey: z.strictObject({
    username: z.string(),
    passkey: z.string(),
    passkeyDeviceType: z.optional(z.enum(['multiDevice', 'singleDevice'])),
  }),
  passkeyRemoved: z.strictObject({
    username: z.string(),
    nameMode: z.string(),
    passkey: z.string(),
    passkeyDeviceType: z.optional(z.enum(['multiDevice', 'singleDevice'])),
  }),
  authReset: z.strictObject({ username: z.string(), target: z.string() }),
  switchedToPasskey: z.strictObject({
    username: z.string(),
    passkey: z.string(),
    passkeyDeviceType: z.optional(z.enum(['multiDevice', 'singleDevice'])),
  }),
  switchedToPassword: z.strictObject({ username: z.string() }),
  participantsRemoved: z.strictObject({
    username: z.string(),
    count: z.number(),
  }),
  participantsAdded: z.strictObject({
    username: z.string(),
    count: z.number(),
  }),
  interviewsDeleted: z.strictObject({
    username: z.string(),
    count: z.number(),
  }),
  dataExported: z.strictObject({ username: z.string(), count: z.number() }),
  settingChanged: z.strictObject({
    username: z.string(),
    setting: z.string(),
    value: z.string(),
  }),
  twoFactorEnabled: z.strictObject({ username: z.string() }),
  twoFactorDisabled: z.strictObject({ username: z.string() }),
  recoveryCodesRegenerated: z.strictObject({ username: z.string() }),
  twoFactorReset: z.strictObject({ username: z.string(), target: z.string() }),
} satisfies Record<keyof typeof activityDetailMessages, z.ZodMiniType>;

type DetailValues = {
  [Kind in keyof typeof activityValueSchemas]: z.infer<
    (typeof activityValueSchemas)[Kind]
  >;
};
export type ActivityLocalization = {
  [Kind in keyof DetailValues]: { kind: Kind; values: DetailValues[Kind] };
}[keyof DetailValues];

const metadataSchema = z.strictObject({
  kind: z.string(),
  values: z.unknown(),
});
function isActivityKind(kind: string): kind is keyof DetailValues {
  return Object.hasOwn(activityValueSchemas, kind);
}

/** Historical free text stays verbatim. New records carry a stable template
 * identity alongside the original exportable message, never translated prose. */
export function formatActivityDetails(
  intl: IntlShape,
  activity: { message: string; localization?: unknown },
): string {
  const parsed = metadataSchema.safeParse(activity.localization);
  if (!parsed.success || !isActivityKind(parsed.data.kind))
    return activity.message;
  const { kind } = parsed.data;
  const values = activityValueSchemas[kind].safeParse(parsed.data.values);
  if (!values.success) return activity.message;
  const formattedValues = Object.fromEntries(
    Object.entries(values.data).map(([key, value]) => [
      key,
      Array.isArray(value) ? intl.formatList(value) : value,
    ]),
  );
  if (
    'passkeyDeviceType' in values.data &&
    typeof values.data.passkeyDeviceType === 'string'
  ) {
    formattedValues.passkey = formatPasskeyName(intl, {
      friendlyName: null,
      deviceType: values.data.passkeyDeviceType,
    });
  }
  return intl.formatMessage(activityDetailMessages[kind], formattedValues);
}
