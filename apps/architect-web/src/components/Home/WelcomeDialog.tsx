import Dialog from '~/components/NewComponents/Dialog';
import { Button } from '~/lib/legacy-ui/components';

type WelcomeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const COMMUNITY_URL = 'https://community.networkcanvas.com';

/**
 * First-run welcome dialog, launched from the welcome toast on the start
 * screen. Friendly, plain-language overview of what Architect Web is, how it
 * differs from the desktop app, and where a participant's data lives.
 */
const WelcomeDialog = ({ open, onOpenChange }: WelcomeDialogProps) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="Welcome to Architect Web! 🎉"
    footer={
      <Dialog.Close
        nativeButton={false}
        render={<Button color="sea-green">Got it!</Button>}
      />
    }
    className="bg-surface-2"
  >
    <div className="flex flex-col gap-5 text-base leading-relaxed">
      <p className="my-0">
        Architect is the protocol designer for Network Canvas. You use it to
        build the interviews — name generators, sociograms, forms, and more —
        that researchers run with participants.
      </p>

      <section>
        <h4 className="mt-0 mb-1 font-semibold">
          How is this different from the desktop app?
        </h4>
        <p className="my-0">
          Architect Web does the same job as the Architect desktop app, but it
          runs entirely in your browser. There's nothing to download or update —
          you always have the latest version, on any computer.
        </p>
      </section>

      <section>
        <h4 className="mt-0 mb-1 font-semibold">Where is my data stored?</h4>
        <p className="my-0">
          Your work stays on your own device. Architect Web saves your protocols
          locally in your browser and never uploads them to a server. Because
          they live in the browser, be sure to export your{' '}
          <code className="code">.netcanvas</code> files and keep your own
          backups.
        </p>
      </section>

      <section>
        <h4 className="mt-0 mb-1 font-semibold">Need a hand?</h4>
        <p className="my-0">
          You can get help and support from the{' '}
          <a
            href={COMMUNITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-action font-semibold underline underline-offset-2"
          >
            Network Canvas Community
          </a>
          . It's the best place to ask questions and meet other researchers.
        </p>
      </section>

      <p className="my-0">
        We'd love to hear what you think — your feedback and suggestions help
        shape where Network Canvas goes next. Happy designing!
      </p>
    </div>
  </Dialog>
);

export default WelcomeDialog;
