import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import * as authApi from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';
import type { IdleTimeoutMinutes } from '~/lib/auth/AuthContext';
import { updateSettings } from '~/lib/db/api';

import { ExternalLink } from './ExternalLink';
import AuthorisationGlyph from './SetupWizard/AuthorisationGlyph';
import SecureDataGlyph from './SetupWizard/SecureDataGlyph';
import SetupGlyph from './SetupWizard/SetupGlyph';
import Step2MethodPicker from './SetupWizard/Step2MethodPicker';
import Step3Configure from './SetupWizard/Step3Configure';
import Step4Behavior from './SetupWizard/Step4Behavior';
import Step5Analytics from './SetupWizard/Step5Analytics';

export type WizardSelectedMethod = 'biometric' | 'pin' | 'passphrase' | 'none';

export type SetupWizardData = {
  selectedMethod: WizardSelectedMethod | null;
  enrolmentCommitted: boolean;
  behavior: {
    idleTimeoutMinutes: IdleTimeoutMinutes;
    requireUnlockOnEnter: boolean;
    requireUnlockOnExit: boolean;
    requireUnlockOnExport: boolean;
  };
  // Undefined when the user never touched the toggle — defaults to enabled.
  analyticsEnabled?: boolean;
};

const DEFAULT_BEHAVIOR: SetupWizardData['behavior'] = {
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
};

// If a previous step committed enrolment (e.g. the user configured a PIN,
// then went back), revoke it before falling back to mode: none.
async function enrolWithoutSecurity() {
  const status = await authApi.status();
  if (status.configured && status.mode !== 'none') {
    await authApi.revoke();
  }
  await authApi.enrolWithoutLock();
}

export function useSetupWizard() {
  const { openDialog } = useDialog();
  const { refresh } = useAuth();
  const analytics = useAnalytics();
  const toast = useToast();

  const openSetupWizard = async (): Promise<void> => {
    const result = await openDialog({
      type: 'wizard',
      title: '🔑 Secure this device',
      confirmCancel: {
        intent: 'destructive',
        title: 'Skip the wizard?',
        description:
          'Your device will be left unsecured, and default preferences will be assumed. Are you sure you want to skip the setup wizard?',
        primaryLabel: 'Use app without security',
        cancelLabel: 'Go back to wizard',
      },
      cancelLabel: 'Skip Wizard',
      steps: [
        {
          title: 'Setting up your device',
          content: () => (
            <div className="grid gap-6">
              <SetupGlyph />
              <div>
                <Paragraph intent="lead">
                  Setting up your device is quick and easy, and will take no
                  more than a few minutes.
                </Paragraph>
                <Paragraph>
                  There are two simple steps: setting up app security, and
                  confirming your app preferences. This wizard will guide you
                  through both. You can change all of these settings later from
                  the Settings screen.
                </Paragraph>
                <Paragraph>
                  If you need help or have questions, please reach out to the
                  Network Canvas team at{' '}
                  <ExternalLink href="mailto:info@networkcanvas.com">
                    info@networkcanvas.com
                  </ExternalLink>
                  , or visit our{' '}
                  <ExternalLink href="https://community.networkcanvas.com">
                    community forum
                  </ExternalLink>
                  .
                </Paragraph>
              </div>
            </div>
          ),
        },
        {
          title: 'Securing your data',
          content: () => (
            <>
              <Paragraph intent="lead">
                Securing your research data is vital. Interviewer implements two
                layers of protection: secure data storage, and app authorization
                checks.
              </Paragraph>
              <div className="my-6 grid gap-4">
                <Surface spacing="sm" shadow="sm">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-primary bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-full">
                      <SecureDataGlyph />
                    </span>
                    <Heading level="h4" margin="none">
                      Secure Data Storage
                    </Heading>
                  </div>
                  <Paragraph margin="none" emphasis="muted" intent="smallText">
                    Secure data storage protects your interview data by
                    encrypting it, so that even if someone gains access to your
                    device or its files, they won't be able to read your data.
                  </Paragraph>
                  <Alert variant="info">
                    <AlertTitle>Good news!</AlertTitle>
                    <AlertDescription>
                      If you set up a PIN, passphrase, or biometric lock next,
                      your data is encrypted in this browser with a key derived
                      from it. The key never leaves your device, so your data
                      stays unreadable without it.
                    </AlertDescription>
                  </Alert>
                </Surface>
                <Surface spacing="sm" shadow="sm">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-accent bg-accent/15 flex size-10 shrink-0 items-center justify-center rounded-full">
                      <AuthorisationGlyph />
                    </span>
                    <Heading level="h4" margin="none">
                      App Authorization
                    </Heading>
                  </div>
                  <Paragraph margin="none" emphasis="muted" intent="smallText">
                    App authorization ensures that only authorized users can
                    access the app, and perform certain sensitive actions (such
                    as exporting data, and entering/leaving interviews). It also
                    requires re-authentication after a specific configurable
                    period of inactivity.
                  </Paragraph>
                </Surface>
              </div>
              <Paragraph>
                Please note that these security features should be used{' '}
                <em>in addition</em> to general device security best practices,
                such as enabling device-level storage encryption, using a strong
                device password, keeping your operating system up to date, and
                being cautious about installing untrusted apps or files.
              </Paragraph>
            </>
          ),
        },
        {
          title: 'Choose an authentication method',
          description:
            'Choose between the options below to determine how you will be prompted to unlock the app.',
          content: Step2MethodPicker,
        },
        {
          title: 'Set up your method',
          content: Step3Configure,
          skip: ({ data }) => data.selectedMethod === 'none',
        },
        {
          title: 'Lock behavior',
          description: 'Decide when the app re-locks.',
          content: Step4Behavior,
          skip: ({ data }) => data.selectedMethod === 'none',
        },
        {
          title: 'Help improve the app',
          content: Step5Analytics,
          nextLabel: 'Finish',
        },
      ],
    });

    // Enrolment + settings persistence can fail (e.g. the platform store can't
    // be opened). Surface it instead of leaving the user stranded on the
    // welcome screen with no feedback — they stay on /welcome and can retry.
    try {
      if (!result) {
        // Dismissed.
        await enrolWithoutSecurity();
      } else {
        const data = result as SetupWizardData;
        if (data.selectedMethod === 'none') {
          // Step3Configure is skipped for 'none', so no step enrolled a vault.
          await enrolWithoutSecurity();
        }
        const behavior = data.behavior ?? DEFAULT_BEHAVIOR;
        await updateSettings({
          idleTimeoutMinutes: behavior.idleTimeoutMinutes,
          requireUnlockOnEnter: behavior.requireUnlockOnEnter,
          requireUnlockOnExit: behavior.requireUnlockOnExit,
          requireUnlockOnExport: behavior.requireUnlockOnExport,
        });
        // Persist + apply the analytics choice (defaults to enabled). Routes
        // through the provider so opt-in/out and the native preference mirror
        // take effect immediately.
        await analytics.setEnabled(data.analyticsEnabled ?? true);
      }

      await refresh();
    } catch (cause) {
      toast.add({
        title: 'Setup could not be completed',
        description:
          cause instanceof Error
            ? cause.message
            : 'Something went wrong while setting up this device. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return { openSetupWizard };
}
