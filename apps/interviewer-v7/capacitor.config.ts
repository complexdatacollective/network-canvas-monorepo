import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAP_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'org.complexdatacollective.interviewer7',
  appName: 'Network Canvas Interviewer 7',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
  ios: {
    // Edge-to-edge so iPadOS 26's window controls sit over the app's own
    // content (a transparent titlebar) rather than a system-coloured bar. The
    // app keeps its top content clear of the controls via env(safe-area-inset).
    contentInset: 'never',
  },
  android: {
    allowMixedContent: Boolean(devServerUrl),
  },
};

export default config;
