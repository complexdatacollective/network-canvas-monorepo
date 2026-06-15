import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

type Method = 'pin' | 'passphrase' | 'biometric';

const COPY: Record<Method, string> = {
  pin: "If you forget your PIN, all data on this device — including imported protocols and recorded interviews — will become permanently inaccessible. There is no way to recover, reset, or bypass app security. The 'Reset all app data' menu option lets you start over with a blank app, but existing data cannot be recovered.",
  passphrase:
    "If you forget your passphrase, all data on this device — including imported protocols and recorded interviews — will become permanently inaccessible. There is no way to recover, reset, or bypass app security. The 'Reset all app data' menu option lets you start over with a blank app, but existing data cannot be recovered.",
  biometric:
    "If your biometric is no longer available — for example, you reset Face ID, replace the device, or remove the credential — all data on this device will become permanently inaccessible. There is no way to recover, reset, or bypass app security. The 'Reset all app data' menu option lets you start over with a blank app, but existing data cannot be recovered.",
};

export default function NoRecoveryNotice({ method }: { method: Method }) {
  return (
    <Alert variant="warning">
      <AlertTitle>No recovery</AlertTitle>
      <AlertDescription>{COPY[method]}</AlertDescription>
    </Alert>
  );
}
