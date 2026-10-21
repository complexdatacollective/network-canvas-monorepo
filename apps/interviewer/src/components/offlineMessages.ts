import { defineMessages } from '@codaco/app-i18n/messages';

// Whether Interviewer is saved on this device for use without a network: one
// status for the whole app, whatever protocols it holds, in the status row,
// Settings and the interview screen.
export const offlineMessages = defineMessages({
  readyChip: {
    id: 'interviewer.offline.readyChip',
    defaultMessage: 'Ready for offline',
    description:
      'Short status at the bottom of the home screen: Interviewer is saved on this device, so it and every protocol on it work without an internet connection.',
  },
  notReadyChip: {
    id: 'interviewer.offline.notReadyChip',
    defaultMessage: 'Not ready for offline',
    description:
      'Short warning status at the bottom of the home screen: Interviewer has not finished downloading for use without an internet connection, so protocols cannot be used offline yet.',
  },
  downloadingChip: {
    id: 'interviewer.offline.downloadingChip',
    defaultMessage:
      '{hasProgress, select, true {Downloading for offline: {percent}} other {Downloading for offline}}',
    description:
      'Short status at the bottom of the home screen while Interviewer downloads what it needs to work without an internet connection. {percent} is how much has downloaded, already formatted as a percentage (for example “45%”); hasProgress is false when that is not known.',
  },
  downloadingHelp: {
    id: 'interviewer.offline.downloadingHelp',
    defaultMessage:
      'Interviewer is downloading all data required for fully offline operation. Keep Interviewer open while you are online until it is ready.',
    description:
      'Explanation of the downloading status, shown in the home screen status bar and in Settings while Interviewer downloads what it needs to work without an internet connection, with what to do meanwhile.',
  },
  downloadProgressLabel: {
    id: 'interviewer.offline.downloadProgressLabel',
    defaultMessage: 'Download for offline use',
    description:
      'Accessible name of the progress bar showing how much of what Interviewer needs to work without an internet connection has downloaded.',
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
      'Interviewer has not finished downloading all data required for fully offline operation. Keep Interviewer open while you are online until it is ready.',
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
  downloading: {
    id: 'interviewer.offline.downloading',
    defaultMessage:
      '{hasProgress, select, true {Downloading: {percent}} other {Downloading}}',
    description:
      'Short status in Settings, in the “Offline use” row, while Interviewer downloads what it needs to work offline. {percent} is how much has downloaded, already formatted as a percentage (for example “45%”); hasProgress is false when that is not known.',
  },
  notReady: {
    id: 'interviewer.offline.notReady',
    defaultMessage: 'Not ready',
    description:
      'Short warning status in Settings, in the “Offline use” row: Interviewer cannot be used offline on this device yet.',
  },
});
