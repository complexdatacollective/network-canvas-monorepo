import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useResetAppData } from '~/lib/auth/useResetAppData';

const HELPER_TEXT = 'Forgotten your credentials?';
const RESET_LABEL = 'Reset app data';

// Subordinate "escape hatch" for a user who has forgotten their
// PIN/passphrase/recovery. Lives in the dialog footer as the left-pinned action
// (mr-auto), opposite the primary Unlock, following DialogFooter's
// escape-hatch-left / primary-right convention. Deliberately quiet (link
// variant) so it never competes with unlocking. Laid out inline so it stays a
// single row height that lines up with the fixed-height Unlock button beside it;
// centred on phone portrait where the footer stacks.
export function ResetAppDataButton() {
  const requestReset = useResetAppData();

  return (
    <div className="phone-landscape:mr-auto phone-landscape:justify-start flex flex-wrap items-center justify-center gap-x-2 text-center">
      <Paragraph margin="none" intent="smallText" emphasis="muted">
        {HELPER_TEXT}
      </Paragraph>
      <Button
        variant="link"
        onClick={() => void requestReset()}
        data-testid="reset-app-data"
      >
        {RESET_LABEL}
      </Button>
    </div>
  );
}
