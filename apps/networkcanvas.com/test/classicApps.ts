import { createClassicApps } from '~/lib/getStarted';

export const classicApps = createClassicApps({
  architect: {
    version: '6.6.0',
    latestUrl:
      'https://github.com/complexdatacollective/Architect/releases/latest',
    assets: [
      {
        name: 'Network.Canvas.Architect-6.6.0-mac-arm64.dmg',
        browserDownloadUrl:
          'https://github.com/complexdatacollective/Architect/releases/download/v6.6.0/Network.Canvas.Architect-6.6.0-mac-arm64.dmg',
      },
      {
        name: 'Network.Canvas.Architect-6.6.0-mac-x64.dmg',
        browserDownloadUrl:
          'https://github.com/complexdatacollective/Architect/releases/download/v6.6.0/Network.Canvas.Architect-6.6.0-mac-x64.dmg',
      },
      {
        name: 'Network.Canvas.Architect-6.6.0-win-x64.exe',
        browserDownloadUrl:
          'https://github.com/complexdatacollective/Architect/releases/download/v6.6.0/Network.Canvas.Architect-6.6.0-win-x64.exe',
      },
    ],
  },
  interviewer: {
    version: '6.6.0',
    latestUrl:
      'https://github.com/complexdatacollective/Interviewer/releases/latest',
    assets: [
      {
        name: 'Network.Canvas.Interviewer-6.6.0-arm64.dmg',
        browserDownloadUrl:
          'https://github.com/complexdatacollective/Interviewer/releases/download/v6.6.0/Network.Canvas.Interviewer-6.6.0-arm64.dmg',
      },
      {
        name: 'Network.Canvas.Interviewer-6.6.0.dmg',
        browserDownloadUrl:
          'https://github.com/complexdatacollective/Interviewer/releases/download/v6.6.0/Network.Canvas.Interviewer-6.6.0.dmg',
      },
      {
        name: 'Network.Canvas.Interviewer.Setup.6.6.0.exe',
        browserDownloadUrl:
          'https://github.com/complexdatacollective/Interviewer/releases/download/v6.6.0/Network.Canvas.Interviewer.Setup.6.6.0.exe',
      },
    ],
  },
});
