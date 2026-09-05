import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';

const messages = defineMessages({
  ProtocolInstalled: {
    id: 'fresco.activity.ProtocolInstalled',
    defaultMessage: 'Protocol Installed',
    description:
      'Localized display label for the stable ' +
      'Protocol Installed' +
      ' activity event type. Never persist the translated label.',
  },
  ProtocolUninstalled: {
    id: 'fresco.activity.ProtocolUninstalled',
    defaultMessage: 'Protocol Uninstalled',
    description:
      'Localized display label for the stable ' +
      'Protocol Uninstalled' +
      ' activity event type. Never persist the translated label.',
  },
  ParticipantsAdded: {
    id: 'fresco.activity.ParticipantsAdded',
    defaultMessage: 'Participants Added',
    description:
      'Localized display label for the stable ' +
      'Participant(s) Added' +
      ' activity event type. Never persist the translated label.',
  },
  ParticipantsRemoved: {
    id: 'fresco.activity.ParticipantsRemoved',
    defaultMessage: 'Participants Removed',
    description:
      'Localized display label for the stable ' +
      'Participant(s) Removed' +
      ' activity event type. Never persist the translated label.',
  },
  InterviewStarted: {
    id: 'fresco.activity.InterviewStarted',
    defaultMessage: 'Interview Started',
    description:
      'Localized display label for the stable ' +
      'Interview Started' +
      ' activity event type. Never persist the translated label.',
  },
  InterviewCompleted: {
    id: 'fresco.activity.InterviewCompleted',
    defaultMessage: 'Interview Completed',
    description:
      'Localized display label for the stable ' +
      'Interview Completed' +
      ' activity event type. Never persist the translated label.',
  },
  InterviewOpened: {
    id: 'fresco.activity.InterviewOpened',
    defaultMessage: 'Interview Opened',
    description:
      'Localized display label for the stable ' +
      'Interview Opened' +
      ' activity event type. Never persist the translated label.',
  },
  InterviewsDeleted: {
    id: 'fresco.activity.InterviewsDeleted',
    defaultMessage: 'Interviews Deleted',
    description:
      'Localized display label for the stable ' +
      'Interview(s) Deleted' +
      ' activity event type. Never persist the translated label.',
  },
  DataExported: {
    id: 'fresco.activity.DataExported',
    defaultMessage: 'Data Exported',
    description:
      'Localized display label for the stable ' +
      'Data Exported' +
      ' activity event type. Never persist the translated label.',
  },
  APITokenCreated: {
    id: 'fresco.activity.APITokenCreated',
    defaultMessage: 'API Token Created',
    description:
      'Localized display label for the stable ' +
      'API Token Created' +
      ' activity event type. Never persist the translated label.',
  },
  APITokenUpdated: {
    id: 'fresco.activity.APITokenUpdated',
    defaultMessage: 'API Token Updated',
    description:
      'Localized display label for the stable ' +
      'API Token Updated' +
      ' activity event type. Never persist the translated label.',
  },
  APITokenDeleted: {
    id: 'fresco.activity.APITokenDeleted',
    defaultMessage: 'API Token Deleted',
    description:
      'Localized display label for the stable ' +
      'API Token Deleted' +
      ' activity event type. Never persist the translated label.',
  },
  UserLogin: {
    id: 'fresco.activity.UserLogin',
    defaultMessage: 'User Login',
    description:
      'Localized display label for the stable ' +
      'User Login' +
      ' activity event type. Never persist the translated label.',
  },
  UserCreated: {
    id: 'fresco.activity.UserCreated',
    defaultMessage: 'User Created',
    description:
      'Localized display label for the stable ' +
      'User Created' +
      ' activity event type. Never persist the translated label.',
  },
  UserDeleted: {
    id: 'fresco.activity.UserDeleted',
    defaultMessage: 'User Deleted',
    description:
      'Localized display label for the stable ' +
      'User Deleted' +
      ' activity event type. Never persist the translated label.',
  },
  PasswordChanged: {
    id: 'fresco.activity.PasswordChanged',
    defaultMessage: 'Password Changed',
    description:
      'Localized display label for the stable ' +
      'Password Changed' +
      ' activity event type. Never persist the translated label.',
  },
  TwoFactorEnabled: {
    id: 'fresco.activity.TwoFactorEnabled',
    defaultMessage: 'Two-Factor Enabled',
    description:
      'Localized display label for the stable ' +
      'Two-Factor Enabled' +
      ' activity event type. Never persist the translated label.',
  },
  TwoFactorDisabled: {
    id: 'fresco.activity.TwoFactorDisabled',
    defaultMessage: 'Two-Factor Disabled',
    description:
      'Localized display label for the stable ' +
      'Two-Factor Disabled' +
      ' activity event type. Never persist the translated label.',
  },
  TwoFactorReset: {
    id: 'fresco.activity.TwoFactorReset',
    defaultMessage: 'Two-Factor Reset',
    description:
      'Localized display label for the stable ' +
      'Two-Factor Reset' +
      ' activity event type. Never persist the translated label.',
  },
  RecoveryCodeUsed: {
    id: 'fresco.activity.RecoveryCodeUsed',
    defaultMessage: 'Recovery Code Used',
    description:
      'Localized display label for the stable ' +
      'Recovery Code Used' +
      ' activity event type. Never persist the translated label.',
  },
  RecoveryCodesRegenerated: {
    id: 'fresco.activity.RecoveryCodesRegenerated',
    defaultMessage: 'Recovery Codes Regenerated',
    description:
      'Localized display label for the stable ' +
      'Recovery Codes Regenerated' +
      ' activity event type. Never persist the translated label.',
  },
  PasskeyRegistered: {
    id: 'fresco.activity.PasskeyRegistered',
    defaultMessage: 'Passkey Registered',
    description:
      'Localized display label for the stable ' +
      'Passkey Registered' +
      ' activity event type. Never persist the translated label.',
  },
  PasskeyRemoved: {
    id: 'fresco.activity.PasskeyRemoved',
    defaultMessage: 'Passkey Removed',
    description:
      'Localized display label for the stable ' +
      'Passkey Removed' +
      ' activity event type. Never persist the translated label.',
  },
  PasswordRemoved: {
    id: 'fresco.activity.PasswordRemoved',
    defaultMessage: 'Password Removed',
    description:
      'Localized display label for the stable ' +
      'Password Removed' +
      ' activity event type. Never persist the translated label.',
  },
  PasswordSet: {
    id: 'fresco.activity.PasswordSet',
    defaultMessage: 'Password Set',
    description:
      'Localized display label for the stable ' +
      'Password Set' +
      ' activity event type. Never persist the translated label.',
  },
  AuthReset: {
    id: 'fresco.activity.AuthReset',
    defaultMessage: 'Auth Reset',
    description:
      'Localized display label for the stable ' +
      'Auth Reset' +
      ' activity event type. Never persist the translated label.',
  },
  SwitchedtoPasskeyMode: {
    id: 'fresco.activity.SwitchedtoPasskeyMode',
    defaultMessage: 'Switched to Passkey Mode',
    description:
      'Localized display label for the stable ' +
      'Switched to Passkey Mode' +
      ' activity event type. Never persist the translated label.',
  },
  SwitchedtoPasswordMode: {
    id: 'fresco.activity.SwitchedtoPasswordMode',
    defaultMessage: 'Switched to Password Mode',
    description:
      'Localized display label for the stable ' +
      'Switched to Password Mode' +
      ' activity event type. Never persist the translated label.',
  },
  SettingChanged: {
    id: 'fresco.activity.SettingChanged',
    defaultMessage: 'Setting Changed',
    description:
      'Localized display label for the stable ' +
      'Setting Changed' +
      ' activity event type. Never persist the translated label.',
  },
  SyntheticDataGenerated: {
    id: 'fresco.activity.SyntheticDataGenerated',
    defaultMessage: 'Synthetic Data Generated',
    description:
      'Localized display label for the stable ' +
      'Synthetic Data Generated' +
      ' activity event type. Never persist the translated label.',
  },
  SyntheticDataDeleted: {
    id: 'fresco.activity.SyntheticDataDeleted',
    defaultMessage: 'Synthetic Data Deleted',
    description:
      'Localized display label for the stable ' +
      'Synthetic Data Deleted' +
      ' activity event type. Never persist the translated label.',
  },
  TwoFactorLogin: {
    id: 'fresco.activity.TwoFactorLogin',
    defaultMessage: 'Two-Factor Login',
    description:
      'Localized display label for the stable ' +
      'Two-Factor Login' +
      ' activity event type. Never persist the translated label.',
  },
  PasskeyLogin: {
    id: 'fresco.activity.PasskeyLogin',
    defaultMessage: 'Passkey Login',
    description:
      'Localized display label for the stable ' +
      'Passkey Login' +
      ' activity event type. Never persist the translated label.',
  },
  RecoveryCodeLogin: {
    id: 'fresco.activity.RecoveryCodeLogin',
    defaultMessage: 'Recovery Code Login',
    description:
      'Localized display label for the stable ' +
      'Recovery Code Login' +
      ' activity event type. Never persist the translated label.',
  },
});
const eventMessages: Readonly<Record<string, MessageDescriptor>> = {
  'Protocol Installed': messages.ProtocolInstalled,
  'Protocol Uninstalled': messages.ProtocolUninstalled,
  'Participant(s) Added': messages.ParticipantsAdded,
  'Participant(s) Removed': messages.ParticipantsRemoved,
  'Interview Started': messages.InterviewStarted,
  'Interview Completed': messages.InterviewCompleted,
  'Interview Opened': messages.InterviewOpened,
  'Interview(s) Deleted': messages.InterviewsDeleted,
  'Data Exported': messages.DataExported,
  'API Token Created': messages.APITokenCreated,
  'API Token Updated': messages.APITokenUpdated,
  'API Token Deleted': messages.APITokenDeleted,
  'User Login': messages.UserLogin,
  'User Created': messages.UserCreated,
  'User Deleted': messages.UserDeleted,
  'Password Changed': messages.PasswordChanged,
  'Two-Factor Enabled': messages.TwoFactorEnabled,
  'Two-Factor Disabled': messages.TwoFactorDisabled,
  'Two-Factor Reset': messages.TwoFactorReset,
  'Recovery Code Used': messages.RecoveryCodeUsed,
  'Recovery Codes Regenerated': messages.RecoveryCodesRegenerated,
  'Passkey Registered': messages.PasskeyRegistered,
  'Passkey Removed': messages.PasskeyRemoved,
  'Password Removed': messages.PasswordRemoved,
  'Password Set': messages.PasswordSet,
  'Auth Reset': messages.AuthReset,
  'Switched to Passkey Mode': messages.SwitchedtoPasskeyMode,
  'Switched to Password Mode': messages.SwitchedtoPasswordMode,
  'Setting Changed': messages.SettingChanged,
  'Synthetic Data Generated': messages.SyntheticDataGenerated,
  'Synthetic Data Deleted': messages.SyntheticDataDeleted,
  'Two-Factor Login': messages.TwoFactorLogin,
  'Passkey Login': messages.PasskeyLogin,
  'Recovery Code Login': messages.RecoveryCodeLogin,
};

export function formatActivityType(intl: IntlShape, type: string): string {
  const message = eventMessages[type];
  return message ? intl.formatMessage(message) : type;
}
