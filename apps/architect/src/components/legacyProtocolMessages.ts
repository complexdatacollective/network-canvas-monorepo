import { defineMessages } from '@codaco/app-i18n/messages';

// Copy shared by every place that offers a choice about a protocol made for an
// older schema: the open dialog, the library's rows and their menus, and the
// hand-off to Architect 8. One definition each, so a button and the menu item
// that does the same thing can never be worded differently.
//
// Versions are arguments rather than literals so the same copy serves the
// next schema bump.
export const legacyProtocolMessages = defineMessages({
  upgradeToSchema: {
    id: 'architect.legacyProtocol.upgradeToSchema',
    defaultMessage: 'Upgrade to schema {version}',
    description:
      'Button and menu item that creates an upgraded copy of an older protocol at the current schema version and opens it. {version} is the current schema version number (for example 9).',
  },
  keepEditingAsSchema: {
    id: 'architect.legacyProtocol.keepEditingAsSchema',
    defaultMessage: 'Keep editing as schema {version}',
    description:
      'Button in the dialog shown when opening an older protocol. Leaves the protocol unchanged and opens it in the previous version of Architect, which edits that schema. {version} is the older schema version number (for example 8).',
  },
  schemaBadge: {
    id: 'architect.legacyProtocol.schemaBadge',
    defaultMessage: 'Schema {version}',
    description:
      'Short badge on a protocol in the home screen library, marking a protocol made for an older schema version. {version} is that protocol’s schema version number (for example 8).',
  },
  openInArchitect: {
    id: 'architect.legacyProtocol.openInArchitect',
    defaultMessage: 'Open in Architect {version}',
    description:
      'Menu item on an older protocol in the home screen library. Opens the protocol, unchanged, in the previous version of Architect. {version} is that version’s number (for example 8).',
  },
  couldNotOpenInArchitect: {
    id: 'architect.legacyProtocol.couldNotOpenInArchitect',
    defaultMessage: 'Could not open in Architect {version}',
    description:
      'Title of the error dialog shown when a protocol file could not be passed to the previous version of Architect. {version} is that version’s number (for example 8).',
  },
  handoffFailed: {
    id: 'architect.legacyProtocol.handoffFailed',
    defaultMessage:
      'Architect could not prepare this file for Architect {version}. This can happen if storage on this device is full or unavailable. Your file has not been changed.',
    description:
      'Error dialog text shown when a protocol file could not be passed to the previous version of Architect, because it could not be saved temporarily on this device. {version} is that version’s number (for example 8).',
  },
});
