import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useResetAppData } from '~/lib/auth/useResetAppData';

const HELPER_TEXT = 'Forgotten your credentials?';
const RESET_LABEL = 'Reset app data';

// Subordinate escape hatch shown beneath every secured unlock body so a user
// who has forgotten their PIN/passphrase/recovery can start over. Deliberately
// quiet (link variant) so it never competes with the unlock action.
export function ResetAppDataButton() {
  const requestReset = useResetAppData();

  return (
    <div className="mt-6 flex flex-col items-center gap-1 text-center">
      <Paragraph margin="none" intent="smallText" emphasis="muted">
        {HELPER_TEXT}
      </Paragraph>
      <Button variant="link" onClick={() => void requestReset()}>
        {RESET_LABEL}
      </Button>
    </div>
  );
}
