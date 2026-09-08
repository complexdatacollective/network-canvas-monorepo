import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  title: {
    id: 'registry.account.title',
    defaultMessage: 'Template registry',
    description: 'Registry account page title.',
  },
  account: {
    id: 'registry.account.account',
    defaultMessage: 'Your account',
    description: 'Account section heading.',
  },
  loading: {
    id: 'registry.account.loading',
    defaultMessage: 'Loading your account…',
    description: 'Announced account loading state.',
  },
  retry: {
    id: 'registry.account.retry',
    defaultMessage: 'Try again',
    description: 'Retry a failed explicit action.',
  },
  signOut: {
    id: 'registry.account.signOut',
    defaultMessage: 'Sign out',
    description: 'End the current registry session.',
  },
  signingOut: {
    id: 'registry.account.signingOut',
    defaultMessage: 'Signing out…',
    description: 'Announced sign-out progress.',
  },
  signOutFailed: {
    id: 'registry.account.signOutFailed',
    defaultMessage: 'Sign-out could not be confirmed. Try again.',
    description: 'Failed sign-out outcome.',
  },
  signIn: {
    id: 'registry.account.signIn',
    defaultMessage: 'Sign in',
    description: 'Sign-in heading.',
  },
  intro: {
    id: 'registry.account.intro',
    defaultMessage:
      'Sign in with your email address to manage your publisher profile and registry credentials.',
    description: 'Registry sign-in introduction.',
  },
  email: {
    id: 'registry.account.email',
    defaultMessage: 'Email address',
    description: 'Email field label.',
  },
  emailInvalid: {
    id: 'registry.account.emailInvalid',
    defaultMessage: 'Enter a valid email address.',
    description: 'Email field validation message.',
  },
  send: {
    id: 'registry.account.send',
    defaultMessage: 'Send sign-in link',
    description: 'Send a registry magic link.',
  },
  sent: {
    id: 'registry.account.sent',
    defaultMessage:
      'Check your email for a sign-in link. Open it on this device within 5 minutes.',
    description: 'Announced magic link send confirmation.',
  },
  invalidLink: {
    id: 'registry.account.invalidLink',
    defaultMessage:
      'That sign-in link is no longer valid. Request a new link to continue.',
    description: 'Expired or invalid magic link message.',
  },
  unavailable: {
    id: 'registry.account.unavailable',
    defaultMessage:
      'The request could not be completed. Wait a moment and try again.',
    description: 'Bounded request failure without server diagnostics.',
  },
  forbidden: {
    id: 'registry.account.forbidden',
    defaultMessage:
      'Your account cannot perform this action. Refresh your account to check your access.',
    description: 'Permission refusal message.',
  },
  rateLimited: {
    id: 'registry.account.rateLimited',
    defaultMessage:
      'Too many requests. Wait a few minutes before trying again.',
    description: 'Rate-limited request message.',
  },
  signedOut: {
    id: 'registry.account.signedOut',
    defaultMessage: 'Your session has ended. Sign in again to continue.',
    description: 'Expired session message.',
  },
  invalid: {
    id: 'registry.account.invalid',
    defaultMessage: 'Check the values and try again.',
    description: 'Bounded input validation failure.',
  },
  refresh: {
    id: 'registry.account.refresh',
    defaultMessage: 'Refresh account',
    description: 'Reload account permissions.',
  },
  suspended: {
    id: 'registry.account.suspended',
    defaultMessage:
      'Your publisher account is suspended. Publishing and credential changes are unavailable.',
    description: 'Suspended account state.',
  },
  publisher: {
    id: 'registry.account.publisher',
    defaultMessage: 'Publisher profile',
    description: 'Publisher profile section heading.',
  },
  publisherIntro: {
    id: 'registry.account.publisherIntro',
    defaultMessage:
      'Your publisher name and optional ORCID appear with the templates you publish.',
    description: 'Publisher identity explanation.',
  },
  publisherName: {
    id: 'registry.account.publisherName',
    defaultMessage: 'Publisher name',
    description: 'Public publisher display name label.',
  },
  orcid: {
    id: 'registry.account.orcid',
    defaultMessage: 'ORCID',
    description: 'Optional author ORCID label.',
  },
  orcidHint: {
    id: 'registry.account.orcidHint',
    defaultMessage:
      'Use the identifier format 0000-0000-0000-0000. Ownership is not verified by the registry.',
    description: 'ORCID format and verification explanation.',
  },
  saveProfile: {
    id: 'registry.account.saveProfile',
    defaultMessage: 'Save publisher profile',
    description: 'Save or claim the publisher.',
  },
  saved: {
    id: 'registry.account.saved',
    defaultMessage: 'Changes saved.',
    description: 'Announced successful mutation.',
  },
  tokens: {
    id: 'registry.account.tokens',
    defaultMessage: 'Registry credentials',
    description: 'Credential section heading.',
  },
  tokenIntro: {
    id: 'registry.account.tokenIntro',
    defaultMessage:
      'Create a credential for a trusted tool to publish on your behalf. Keep its value private; it is shown once.',
    description: 'Credential purpose and custody guidance.',
  },
  tokenName: {
    id: 'registry.account.tokenName',
    defaultMessage: 'Credential name',
    description: 'Credential label field.',
  },
  tokenScope: {
    id: 'registry.account.tokenScope',
    defaultMessage: 'Permission',
    description: 'Credential permission label.',
  },
  publishScope: {
    id: 'registry.account.publishScope',
    defaultMessage: 'Publish templates',
    description: 'Publisher credential scope option.',
  },
  moderateScope: {
    id: 'registry.account.moderateScope',
    defaultMessage: 'Moderate the registry',
    description: 'Operator credential scope option.',
  },
  lifetime: {
    id: 'registry.account.lifetime',
    defaultMessage: 'Expires after',
    description: 'Credential lifetime select label.',
  },
  days: {
    id: 'registry.account.days',
    defaultMessage: '{days, number} days',
    description: 'Credential lifetime option in days.',
  },
  issue: {
    id: 'registry.account.issue',
    defaultMessage: 'Create credential',
    description: 'Issue a scoped registry credential.',
  },
  secretTitle: {
    id: 'registry.account.secretTitle',
    defaultMessage: 'Save your credential',
    description: 'One-time secret heading.',
  },
  secretHint: {
    id: 'registry.account.secretHint',
    defaultMessage:
      'Copy this value to your trusted tool now. Closing this panel removes it from this page.',
    description: 'One-time credential handling instruction.',
  },
  copy: {
    id: 'registry.account.copy',
    defaultMessage: 'Copy credential',
    description: 'Copy one-time secret to clipboard.',
  },
  copied: {
    id: 'registry.account.copied',
    defaultMessage: 'Credential copied.',
    description: 'Announced clipboard success.',
  },
  copyFailed: {
    id: 'registry.account.copyFailed',
    defaultMessage: 'Copying failed. Select the value and copy it manually.',
    description: 'Clipboard permission or transport failure.',
  },
  dismiss: {
    id: 'registry.account.dismiss',
    defaultMessage: 'I have saved it',
    description: 'Dismiss and clear the one-time credential.',
  },
  none: {
    id: 'registry.account.none',
    defaultMessage: 'No active credentials.',
    description: 'Empty credential list.',
  },
  expires: {
    id: 'registry.account.expires',
    defaultMessage: 'Expires {date, date, medium}',
    description: 'Credential expiry date.',
  },
  revoke: {
    id: 'registry.account.revoke',
    defaultMessage: 'Revoke',
    description: 'Revoke a named credential.',
  },
  revokeTitle: {
    id: 'registry.account.revokeTitle',
    defaultMessage: 'Revoke {name}?',
    description: 'Credential revoke confirmation title.',
  },
  revokeDescription: {
    id: 'registry.account.revokeDescription',
    defaultMessage: 'Tools using this credential will lose access immediately.',
    description: 'Consequence of credential revocation.',
  },
  revoked: {
    id: 'registry.account.revoked',
    defaultMessage: 'Credential revoked.',
    description: 'Announced credential revocation success.',
  },
  moderation: {
    id: 'registry.account.moderation',
    defaultMessage: 'Registry administration',
    description: 'Operator section heading.',
  },
  reports: {
    id: 'registry.account.reports',
    defaultMessage: 'Reported entries',
    description: 'Report list heading.',
  },
  reportIntro: {
    id: 'registry.account.reportIntro',
    defaultMessage:
      'Reports are submitted by registry visitors. Inspect the entry before taking action.',
    description: 'Untrusted report content explanation.',
  },
  noReports: {
    id: 'registry.account.noReports',
    defaultMessage: 'No reports on this page.',
    description: 'Empty report page.',
  },
  olderReports: {
    id: 'registry.account.olderReports',
    defaultMessage: 'Older reports',
    description: 'Load next report page.',
  },
  newestReports: {
    id: 'registry.account.newestReports',
    defaultMessage: 'Newest reports',
    description: 'Load first report page.',
  },
  reportRemoved: {
    id: 'registry.account.reportRemoved',
    defaultMessage: 'Report details were removed with the artifact.',
    description: 'Report tombstone explanation.',
  },
  entryId: {
    id: 'registry.account.entryId',
    defaultMessage: 'Entry ID',
    description: 'Registry entry identifier label.',
  },
  publisherId: {
    id: 'registry.account.publisherId',
    defaultMessage: 'Publisher ID',
    description: 'Registry publisher identifier label.',
  },
  root: {
    id: 'registry.account.root',
    defaultMessage: 'Artifact content root',
    description: 'Content-addressed artifact identifier label.',
  },
  action: {
    id: 'registry.account.action',
    defaultMessage: 'Action',
    description: 'Operator action select label.',
  },
  curate: {
    id: 'registry.account.curate',
    defaultMessage: 'Add curated badge',
    description: 'Curate an entry action.',
  },
  uncurate: {
    id: 'registry.account.uncurate',
    defaultMessage: 'Remove curated badge',
    description: 'Uncurate an entry action.',
  },
  takedown: {
    id: 'registry.account.takedown',
    defaultMessage: 'Take down artifact',
    description: 'Block all access to an artifact.',
  },
  restore: {
    id: 'registry.account.restore',
    defaultMessage: 'Restore artifact access',
    description: 'Reverse an artifact takedown.',
  },
  suspend: {
    id: 'registry.account.suspend',
    defaultMessage: 'Suspend publisher',
    description: 'Suspend a publisher account.',
  },
  reinstate: {
    id: 'registry.account.reinstate',
    defaultMessage: 'Reinstate publisher',
    description: 'Reverse publisher suspension.',
  },
  delete: {
    id: 'registry.account.delete',
    defaultMessage: 'Permanently delete artifact',
    description: 'Queue irreversible artifact content removal.',
  },
  confirmAction: {
    id: 'registry.account.confirmAction',
    defaultMessage: 'Confirm registry action',
    description: 'Operator action confirmation title.',
  },
  confirmEntry: {
    id: 'registry.account.confirmEntry',
    defaultMessage:
      'Apply “{action}” to entry {id}? Takedowns affect every entry sharing the same artifact.',
    description:
      'Entry operation confirmation and shared-artifact consequence.',
  },
  confirmPublisher: {
    id: 'registry.account.confirmPublisher',
    defaultMessage:
      'Apply “{action}” to publisher {id}? Suspension immediately disables their publishing and credentials.',
    description: 'Publisher operation confirmation.',
  },
  confirmDelete: {
    id: 'registry.account.confirmDelete',
    defaultMessage:
      'Permanently remove artifact {root}, its metadata and report details? Every entry using it will become unavailable. This cannot be undone.',
    description: 'Irreversible artifact deletion consequence.',
  },
  apply: {
    id: 'registry.account.apply',
    defaultMessage: 'Apply action',
    description: 'Submit an operator command.',
  },
  curationMetadata: {
    id: 'registry.account.curationMetadata',
    defaultMessage:
      'Curation requires an available entry with author information, a description and keywords.',
    description: 'Curation metadata refusal.',
  },
});
