import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nudos.app',
  appName: 'Nudos',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
