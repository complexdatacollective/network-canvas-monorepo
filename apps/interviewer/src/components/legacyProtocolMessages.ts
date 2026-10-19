import { defineMessages } from '@codaco/app-i18n/messages';

// Copy shared by every place that offers something for a protocol made for an
// older schema: the deck's schema 8 cards and their menus, the upgrade
// confirmation, the import choice and the hand-over to Interviewer 8. One
// definition each, so a button and the menu item that does the same thing can
// never be worded differently.
//
// Versions are arguments rather than literals, so the same copy serves the
// next schema bump.
export const legacyProtocolMessages = defineMessages({
  upgradeToSchema: {
    id: 'interviewer.legacyProtocol.upgradeToSchema',
    defaultMessage: 'Upgrade to schema {version}',
    description:
      'Button and menu item that creates an upgraded copy of an older protocol at the current schema version, for use in this version of Interviewer. {version} is the current schema version number (for example 9).',
  },
  keepOnSchema: {
    id: 'interviewer.legacyProtocol.keepOnSchema',
    defaultMessage: 'Keep on schema {version}',
    description:
      'Button in the dialog shown when importing an older protocol file. Leaves the protocol unchanged and installs it in the previous version of Interviewer, which runs that schema. {version} is the older schema version number (for example 8).',
  },
  schemaBadge: {
    id: 'interviewer.legacyProtocol.schemaBadge',
    defaultMessage: 'Schema {version}',
    description:
      'Short badge on a protocol card on the home screen, marking a protocol made for an older schema version, which runs in the previous version of Interviewer. {version} is that protocol’s schema version number (for example 8).',
  },
  upgradedBadge: {
    id: 'interviewer.legacyProtocol.upgradedBadge',
    defaultMessage: 'Has an upgraded copy',
    description:
      'Short badge on an older protocol’s card on the home screen, shown when an upgraded copy of it has already been made for the current version of Interviewer: it says that such a copy exists. The older protocol carrying the badge is itself unchanged; it is not the copy.',
  },
  openInInterviewer: {
    id: 'interviewer.legacyProtocol.openInInterviewer',
    defaultMessage: 'Open in Interviewer {version}',
    description:
      'Menu item on an older protocol’s card on the home screen. Opens the previous version of Interviewer, which runs this protocol unchanged, ready to start a new interview with it. {version} is that version’s number (for example 8).',
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
      'Interviewer {legacyVersion} is not included in this version of Interviewer, so interviews cannot be started with this protocol here. Upgrade it to schema {currentVersion} to use it.',
    description:
      'Text at the bottom of an older protocol’s card on the home screen when this version of Interviewer does not include the previous version that runs it. {legacyVersion} is the previous version’s number (for example 8); {currentVersion} is the current schema version number (for example 9).',
  },
  notReadyOffline: {
    id: 'interviewer.legacyProtocol.notReadyOffline',
    defaultMessage: 'Not ready offline',
    description:
      'Short warning badge on an older protocol’s card on the home screen: the previous version of Interviewer, which runs this protocol, has not finished downloading for use without an internet connection, so the protocol cannot be used offline yet.',
  },
  couldNotOpenInInterviewer: {
    id: 'interviewer.legacyProtocol.couldNotOpenInInterviewer',
    defaultMessage: 'Could not open in Interviewer {version}',
    description:
      'Title of the error shown when a protocol file could not be passed to the previous version of Interviewer. {version} is that version’s number (for example 8).',
  },
  handoffFailed: {
    id: 'interviewer.legacyProtocol.handoffFailed',
    defaultMessage:
      'Interviewer could not prepare this file for Interviewer {version}. This can happen if storage on this device is full or unavailable. Your file has not been changed.',
    description:
      'Error text shown when a protocol file could not be passed to the previous version of Interviewer, because it could not be saved temporarily on this device. {version} is that version’s number (for example 8).',
  },
});
