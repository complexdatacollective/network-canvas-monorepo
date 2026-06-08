import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAP_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'org.codaco.NetworkCanvasInterviewer6',
  appName: 'Network Canvas Interviewer',
  webDir: 'dist-web',
  server: {
    androidScheme: 'https',
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
  ios: { contentInset: 'always' },
  android: { allowMixedContent: Boolean(devServerUrl) },
};

export default config;
