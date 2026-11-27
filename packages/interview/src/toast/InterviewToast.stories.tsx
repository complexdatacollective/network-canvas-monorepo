import { Toast } from '@base-ui/react/toast';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import {
  InterviewToastProvider,
  InterviewToastViewport,
} from './InterviewToast';
import { useInterviewToast } from './useInterviewToast';

const MESSAGE = 'Add at least one more person before you continue.';

function OpenDialog() {
  const { showToast } = useInterviewToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open details</Button>
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title="Details"
        footer={
          <Button
            onClick={() =>
              showToast({
                description: MESSAGE,
                variant: 'destructive',
                anchor: 'forward',
                timeout: 0,
              })
            }
          >
            Check
          </Button>
        }
      >
        <Paragraph margin="none">
          A message raised from this dialog is shown over it.
        </Paragraph>
      </Dialog>
    </>
  );
}

/** The interview's navigation, which its messages point to, under a dialog. */
function ToastOverDialogDemo() {
  const [toastManager] = useState(() => Toast.createToastManager());
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex min-h-96 items-end justify-between p-8">
      <InterviewToastProvider
        toastManager={toastManager}
        forwardButtonRef={forwardButtonRef}
        backButtonRef={backButtonRef}
        orientation="horizontal"
      >
        <Button ref={backButtonRef}>Back</Button>
        <OpenDialog />
        <Button ref={forwardButtonRef}>Next</Button>
      </InterviewToastProvider>
      <Toast.Provider toastManager={toastManager}>
        <InterviewToastViewport />
      </Toast.Provider>
    </div>
  );
}

const meta: Meta = {
  title: 'Interview/InterviewToast',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The interview's messages are drawn over everything, dialogs included: one
 * raised while a dialog is open can be read and closed without closing the
 * dialog first.
 */
export const ToastOverDialog: Story = {
  render: () => <ToastOverDialogDemo />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Open details' }));
    const dialog = await page.findByRole('dialog', { name: 'Details' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Check' }),
    );
    const region = await page.findByRole('region', {
      name: 'Interview notifications',
    });
    const message = await within(region).findByText(MESSAGE);
    const close = within(region).getByRole('button', { name: 'Close' });

    // The message is what the pointer reaches at its middle and at its close
    // button, not the dialog's backdrop.
    const reaches = (element: Element) => {
      const box = element.getBoundingClientRect();
      const hit = element.ownerDocument.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit !== null && element.contains(hit);
    };
    await waitFor(() => {
      expect(reaches(message), 'the message').toBe(true);
      expect(reaches(close), 'its close button').toBe(true);
    });
    await expect(dialog).toBeVisible();
  },
};
