import { defineMessages } from '@codaco/app-i18n/messages';

// Whether Interviewer is saved on this device for use without a network: one
// status for the whole app, whatever protocols it holds, in the status row,
// Settings and the interview screen.
export const offlineMessages = defineMessages({
  readyChip: {
    id: 'interviewer.offline.readyChip',
    defaultMessage: 'Ready offline',
    description:
      'Short status at the bottom of the home screen: Interviewer is saved on this device, so it and every protocol on it work without an internet connection.',
  },
  notReadyChip: {
    id: 'interviewer.offline.notReadyChip',
    defaultMessage: 'Not ready offline',
    description:
      'Short warning status at the bottom of the home screen: Interviewer has not finished downloading for use without an internet connection, so protocols cannot be used offline yet.',
  },
  readyHelp: {
    id: 'interviewer.offline.readyHelp',
    defaultMessage:
      'Interviewer is saved on this device, so every protocol can be used without an internet connection.',
    description:
      'Explanation of the offline status, shown in the home screen status bar and in Settings: Interviewer is fully saved on this device.',
  },
  notReadyHelp: {
    id: 'interviewer.offline.notReadyHelp',
    defaultMessage:
      'Interviewer has not finished downloading for use without an internet connection, so protocols cannot be used offline yet. Keep Interviewer open while you are online until it is ready.',
    description:
      'Explanation of the warning that Interviewer cannot be used offline yet, with what to do about it. Shown in the home screen status bar, in Settings, and when an interview cannot be opened because the device is offline.',
  },
  settingTitle: {
    id: 'interviewer.offline.settingTitle',
    defaultMessage: 'Offline use',
    description:
      'Title of the row in Settings that says whether Interviewer can be used without an internet connection on this device.',
  },
  ready: {
    id: 'interviewer.offline.ready',
    defaultMessage: 'Ready',
    description:
      'Short status in Settings, in the “Offline use” row: Interviewer can be used offline on this device.',
  },
  notReady: {
    id: 'interviewer.offline.notReady',
    defaultMessage: 'Not ready',
    description:
      'Short warning status in Settings, in the “Offline use” row: Interviewer cannot be used offline on this device yet.',
  },
});
