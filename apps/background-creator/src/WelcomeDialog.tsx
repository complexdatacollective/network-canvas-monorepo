import { type ReactElement, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { setWelcomeDismissed } from '~/state/welcomePreference';

type WelcomeDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function WelcomeDialog({
  open,
  onClose,
}: WelcomeDialogProps): ReactElement {
  const [dontShowAgain, setDontShowAgain] = useState(true);

  // Persist on any close path — Get started, Escape, the backdrop, the close
  // button — so the checkbox is honoured however the dialog is dismissed.
  const handleClose = () => {
    setWelcomeDismissed(dontShowAgain);
    onClose();
  };

  return (
    <Dialog
      open={open}
      closeDialog={handleClose}
      size="readable"
      title="Welcome to Background Creator"
      description="Design the background image behind a sociogram — and the script that sorts each participant into the right part of it."
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="welcome-dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked)}
            />
            <label
              htmlFor="welcome-dont-show-again"
              className="cursor-pointer text-sm"
            >
              Don’t show this again
            </label>
          </div>
          <Button color="primary" onClick={handleClose}>
            Get started
          </Button>
        </div>
      }
    >
      <Heading level="h4">What you can build</Heading>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Draw rectangles, ellipses, lines, polygons and text on a canvas sized
          to your interview screen.
        </li>
        <li>
          Mark any shape as a named zone — the areas participants are sorted
          into.
        </li>
        <li>
          Backgrounds adapt to light and dark themes, and reopen here for more
          editing.
        </li>
      </ul>
      <Heading level="h4">How it works</Heading>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Start from a blank canvas or a template and draw your design.</li>
        <li>Give each zone that matters a label.</li>
        <li>
          Export the SVG background together with an R or Python script that
          assigns participants to your zones.
        </li>
      </ol>
    </Dialog>
  );
}
