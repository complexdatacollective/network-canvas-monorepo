import { defineMessages } from '@codaco/app-i18n/messages';

// Copy shared by every place that shows a protocol made for an older schema:
// the deck's schema 8 cards and their menus, and the new-interview form. One
// definition each, so two places saying the same thing can never be worded
// differently.
//
// Versions are arguments rather than literals, so the same copy serves the
// next schema bump.
export const legacyProtocolMessages = defineMessages({
  schemaBadge: {
    id: 'interviewer.legacyProtocol.schemaBadge',
    defaultMessage: 'Schema {version}',
    description:
      'Short badge on a protocol card on the home screen, marking a protocol made for an older schema version. {version} is that protocol’s schema version number (for example 8).',
  },
  protocolInfo: {
    id: 'interviewer.legacyProtocol.protocolInfo',
    defaultMessage: 'Info',
    description:
      'Menu item on an older protocol’s card on the home screen. Shows details about the protocol (its schema version, when it was imported and how many interviews it has).',
  },
  protocolActions: {
    id: 'interviewer.legacyProtocol.protocolActions',
    defaultMessage: 'Actions for {name}',
    description:
      'Accessible name of the button that opens the menu of actions for an older protocol’s card on the home screen. {name} is the researcher-authored protocol name.',
  },
  notAvailable: {
    id: 'interviewer.legacyProtocol.notAvailable',
    defaultMessage: 'Not available',
    description:
      'Short badge on an older protocol’s card on the home screen, shown when this version of Interviewer does not include the previous version that runs it, so no interview can be started with it here.',
  },
  notAvailableHelp: {
    id: 'interviewer.legacyProtocol.notAvailableHelp',
    defaultMessage:
      'This version of Interviewer cannot run schema {legacyVersion} protocols, so interviews cannot be started with this protocol here.',
    description:
      'Text at the bottom of an older protocol’s card on the home screen, and in place of its new-interview form, when this version of Interviewer does not include the previous version that runs its interviews. {legacyVersion} is the older schema version number, which is also the previous version’s number (for example 8).',
  },
  notReadyOffline: {
    id: 'interviewer.legacyProtocol.notReadyOffline',
    defaultMessage: 'Not ready offline',
    description:
      'Accessible name and tooltip of a status icon inside the “Schema 8” badge on an older protocol’s card on the home screen: the previous version of Interviewer, which runs this protocol, has not finished downloading for use without an internet connection, so the protocol cannot be used offline yet.',
  },
});

// Whether the bundled Interviewer 8 is installed for use without a network,
// in the status row and Settings.
export const legacyOfflineMessages = defineMessages({
  readyChip: {
    id: 'interviewer.legacyOffline.readyChip',
    defaultMessage: 'Interviewer {version} ready offline',
    description:
      'Short status at the bottom of the home screen: the previous version of Interviewer, included with this one to run older protocols, is saved on this device and works without an internet connection. {version} is that version’s number (for example 8).',
  },
  notReadyChip: {
    id: 'interviewer.legacyOffline.notReadyChip',
    defaultMessage: 'Interviewer {version} not ready offline',
    description:
      'Short warning status at the bottom of the home screen: the previous version of Interviewer, included with this one to run older protocols, has not finished downloading for use without an internet connection. {version} is that version’s number (for example 8).',
  },
  readyHelp: {
    id: 'interviewer.legacyOffline.readyHelp',
    defaultMessage:
      'Interviewer {version}, which runs schema {version} protocols, is saved on this device and works without an internet connection.',
    description:
      'Explanation of the status of the previous version of Interviewer, shown in the home screen status bar and in Settings. {version} is that version’s number and the older schema version it runs (for example 8).',
  },
  notReadyHelp: {
    id: 'interviewer.legacyOffline.notReadyHelp',
    defaultMessage:
      'Interviewer {version}, which runs schema {version} protocols, has not finished downloading for use without an internet connection. Keep Interviewer open while you are online until it is ready.',
    description:
      'Explanation of the warning that the previous version of Interviewer cannot be used offline yet, shown in the home screen status bar and in Settings, with what to do about it. {version} is that version’s number and the older schema version it runs (for example 8).',
  },
  settingTitle: {
    id: 'interviewer.legacyOffline.settingTitle',
    defaultMessage: 'Interviewer {version} offline',
    description:
      'Title of the row in Settings that says whether the previous version of Interviewer, which runs older protocols, can be used without an internet connection on this device. {version} is that version’s number (for example 8).',
  },
  ready: {
    id: 'interviewer.legacyOffline.ready',
    defaultMessage: 'Ready',
    description:
      'Short status in Settings: the previous version of Interviewer can be used offline on this device.',
  },
  notReady: {
    id: 'interviewer.legacyOffline.notReady',
    defaultMessage: 'Not ready',
    description:
      'Short warning status in Settings: the previous version of Interviewer cannot be used offline on this device yet.',
  },
});
