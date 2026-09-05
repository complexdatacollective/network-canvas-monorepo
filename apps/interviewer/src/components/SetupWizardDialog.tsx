import { createElement } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
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
import { getSettings, updateSettings } from '~/lib/db/api';

import { ExternalLink } from './ExternalLink';
import AuthorisationGlyph from './SetupWizard/AuthorisationGlyph';
import SecureDataGlyph from './SetupWizard/SecureDataGlyph';
import SetupGlyph from './SetupWizard/SetupGlyph';
import Step2MethodPicker from './SetupWizard/Step2MethodPicker';
import Step3Configure from './SetupWizard/Step3Configure';
import Step4Behavior from './SetupWizard/Step4Behavior';
import Step5Analytics from './SetupWizard/Step5Analytics';

const messages = defineMessages({
  setupCouldNotBeOpened: {
    id: 'interviewer.setupWizardDialog.setupCouldNotBeOpened',
    defaultMessage: 'Setup could not be opened',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  storedSettingsCouldNotBeReadPlease: {
    id: 'interviewer.setupWizardDialog.storedSettingsCouldNotBeReadPlease',
    defaultMessage: 'Stored settings could not be read. Please try again.',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  secureThisDevice: {
    id: 'interviewer.setupWizardDialog.secureThisDevice',
    defaultMessage: '🔑 Secure this device',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  exitSetup: {
    id: 'interviewer.setupWizardDialog.exitSetup',
    defaultMessage: 'Exit setup?',
    description:
      'Confirmation title when abandoning optional security setup opened from Settings.',
  },
  skipTheWizard: {
    id: 'interviewer.setupWizardDialog.skipTheWizard',
    defaultMessage: 'Skip the wizard?',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  ifYouHaveAlreadyConfiguredADevice: {
    id: 'interviewer.setupWizardDialog.ifYouHaveAlreadyConfiguredADevice',
    defaultMessage:
      'If you have already configured a device lock, it will remain active. Otherwise, Interviewer will continue without app security.',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  yourDeviceWillBeLeftUnsecuredAnd: {
    id: 'interviewer.setupWizardDialog.yourDeviceWillBeLeftUnsecuredAnd',
    defaultMessage:
      'Your device will be left unsecured, and default preferences will be assumed. Are you sure you want to skip the setup wizard?',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  exitSetup2: {
    id: 'interviewer.setupWizardDialog.exitSetup2',
    defaultMessage: 'Exit setup',
    description:
      'Action that leaves optional security setup while keeping an already-configured device lock.',
  },
  useAppWithoutSecurity: {
    id: 'interviewer.setupWizardDialog.useAppWithoutSecurity',
    defaultMessage: 'Use app without security',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  goBackToWizard: {
    id: 'interviewer.setupWizardDialog.goBackToWizard',
    defaultMessage: 'Go back to wizard',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  skipWizard: {
    id: 'interviewer.setupWizardDialog.skipWizard',
    defaultMessage: 'Skip Wizard',
    description:
      'Action that requests skipping first-run security setup and using the app without a device lock.',
  },
  settingUpYourDevice: {
    id: 'interviewer.setupWizardDialog.settingUpYourDevice',
    defaultMessage: 'Setting up your device',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  settingUpYourDeviceIsQuickAnd: {
    id: 'interviewer.setupWizardDialog.settingUpYourDeviceIsQuickAnd',
    defaultMessage:
      'Setting up your device is quick and easy, and will take no more than a few minutes.',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  thereAreTwoSimpleStepsSettingUp: {
    id: 'interviewer.setupWizardDialog.thereAreTwoSimpleStepsSettingUp',
    defaultMessage:
      'There are two simple steps: setting up app security, and confirming your app preferences. This wizard will guide you through both. You can change all of these settings later from the Settings screen.',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  ifYouNeedHelpOrHaveQuestions: {
    id: 'interviewer.setupWizardDialog.ifYouNeedHelpOrHaveQuestions',
    defaultMessage:
      'If you need help or have questions, please reach out to the Network Canvas team at <link>info@networkcanvas.com</link>, or visit our <link1>community forum</link1>.',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  securingYourData: {
    id: 'interviewer.setupWizardDialog.securingYourData',
    defaultMessage: 'Securing your data',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  securingYourResearchDataIsVitalInterviewer: {
    id: 'interviewer.setupWizardDialog.securingYourResearchDataIsVitalInterviewer',
    defaultMessage:
      'Securing your research data is vital. Interviewer implements two layers of protection: secure data storage, and app authorization checks.',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  secureDataStorage: {
    id: 'interviewer.setupWizardDialog.secureDataStorage',
    defaultMessage: 'Secure Data Storage',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  secureDataStorageProtectsYourInterviewData: {
    id: 'interviewer.setupWizardDialog.secureDataStorageProtectsYourInterviewData',
    defaultMessage:
      "Secure data storage protects your interview data by encrypting it, so that even if someone gains access to your device or its files, they won't be able to read your data.",
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  goodNews: {
    id: 'interviewer.setupWizardDialog.goodNews',
    defaultMessage: 'Good news!',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  ifYouSetUpAPINPassphrase: {
    id: 'interviewer.setupWizardDialog.ifYouSetUpAPINPassphrase',
    defaultMessage:
      'If you set up a PIN, passphrase, or biometric lock next, your data is encrypted on this device with a key derived from it. The key never leaves your device, so your data stays unreadable without it.',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  appAuthorization: {
    id: 'interviewer.setupWizardDialog.appAuthorization',
    defaultMessage: 'App Authorization',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  appAuthorizationEnsuresThatOnlyAuthorizedUsers: {
    id: 'interviewer.setupWizardDialog.appAuthorizationEnsuresThatOnlyAuthorizedUsers',
    defaultMessage:
      'App authorization ensures that only authorized users can access the app, and perform certain sensitive actions (such as exporting data, and entering/leaving interviews). It also requires re-authentication after a specific configurable period of inactivity.',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  pleaseNoteThatTheseSecurityFeaturesShould: {
    id: 'interviewer.setupWizardDialog.pleaseNoteThatTheseSecurityFeaturesShould',
    defaultMessage:
      'Please note that these security features should be used <em>in addition</em> to general device security best practices, such as enabling device-level storage encryption, using a strong device password, keeping your operating system up to date, and being cautious about installing untrusted apps or files.',
    description: 'Visible copy in Interviewer Setup Wizard Dialog.',
  },
  chooseAnAuthenticationMethod: {
    id: 'interviewer.setupWizardDialog.chooseAnAuthenticationMethod',
    defaultMessage: 'Choose an authentication method',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  chooseBetweenTheOptionsBelowToDetermine: {
    id: 'interviewer.setupWizardDialog.chooseBetweenTheOptionsBelowToDetermine',
    defaultMessage:
      'Choose between the options below to determine how you will be prompted to unlock the app.',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  setUpYourMethod: {
    id: 'interviewer.setupWizardDialog.setUpYourMethod',
    defaultMessage: 'Set up your method',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  lockBehavior: {
    id: 'interviewer.setupWizardDialog.lockBehavior',
    defaultMessage: 'Lock behavior',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  decideWhenTheAppReLocks: {
    id: 'interviewer.setupWizardDialog.decideWhenTheAppReLocks',
    defaultMessage: 'Decide when the app re-locks.',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  helpImproveTheApp: {
    id: 'interviewer.setupWizardDialog.helpImproveTheApp',
    defaultMessage: 'Help improve the app',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  finish: {
    id: 'interviewer.setupWizardDialog.finish',
    defaultMessage: 'Finish',
    description:
      'Final action of security setup that applies the chosen device preferences.',
  },
  setupCouldNotBeCompleted: {
    id: 'interviewer.setupWizardDialog.setupCouldNotBeCompleted',
    defaultMessage: 'Setup could not be completed',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  somethingWentWrongWhileSettingUpThis: {
    id: 'interviewer.setupWizardDialog.somethingWentWrongWhileSettingUpThis',
    defaultMessage:
      'Something went wrong while setting up this device. Please try again.',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  securityStatusCouldNotBeRefreshed: {
    id: 'interviewer.setupWizardDialog.securityStatusCouldNotBeRefreshed',
    defaultMessage: 'Security status could not be refreshed',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
  reloadInterviewerToRefreshThisDeviceS: {
    id: 'interviewer.setupWizardDialog.reloadInterviewerToRefreshThisDeviceS',
    defaultMessage:
      'Reload Interviewer to refresh this device’s security status.',
    description: 'User-facing message in Interviewer Setup Wizard Dialog.',
  },
});

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
  // Undefined when the user never touched the toggle. The wizard launch mode
  // supplies the preference that should be preserved in that case.
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

type UseSetupWizardOptions = {
  /**
   * A Settings-launched wizard may be securing an already-populated database.
   * Once enrolment has re-encrypted those records, leaving or changing methods
   * must not revoke the new vault because revoke() also wipes the database.
   */
  preserveExistingData?: boolean;
};

export function useSetupWizard({
  preserveExistingData = false,
}: UseSetupWizardOptions = {}) {
  const { openDialog } = useDialog();
  const { refresh } = useAuth();
  const analytics = useAnalytics();
  const toast = useToast();

  const openSetupWizard = async (): Promise<void> => {
    let initialAnalyticsEnabled = true;
    if (preserveExistingData) {
      // Settings are readable before vault enrolment. Use the persisted row
      // rather than AnalyticsProvider's safe pre-unlock fallback so an
      // untouched toggle preserves the user's actual preference.
      try {
        initialAnalyticsEnabled = (await getSettings()).analyticsEnabled;
      } catch (cause) {
        console.error('Security setup failed', cause);
        toast.add({
          title: createElement(AppMessage, {
            message: messages.setupCouldNotBeOpened,
          }),
          description: createElement(AppMessage, {
            message: messages.storedSettingsCouldNotBeReadPlease,
          }),
          variant: 'destructive',
        });
        return;
      }
    }

    const result = await openDialog({
      type: 'wizard',
      title: createElement(AppMessage, { message: messages.secureThisDevice }),
      confirmCancel: {
        intent: preserveExistingData ? 'warning' : 'destructive',
        title: preserveExistingData
          ? createElement(AppMessage, { message: messages.exitSetup })
          : createElement(AppMessage, { message: messages.skipTheWizard }),
        description: preserveExistingData
          ? createElement(AppMessage, {
              message: messages.ifYouHaveAlreadyConfiguredADevice,
            })
          : createElement(AppMessage, {
              message: messages.yourDeviceWillBeLeftUnsecuredAnd,
            }),
        primaryLabel: preserveExistingData
          ? createElement(AppMessage, { message: messages.exitSetup2 })
          : createElement(AppMessage, {
              message: messages.useAppWithoutSecurity,
            }),
        cancelLabel: createElement(AppMessage, {
          message: messages.goBackToWizard,
        }),
      },
      cancelLabel: preserveExistingData
        ? createElement(AppMessage, { message: messages.exitSetup2 })
        : createElement(AppMessage, { message: messages.skipWizard }),
      steps: [
        {
          title: createElement(AppMessage, {
            message: messages.settingUpYourDevice,
          }),
          content: () => (
            <div className="grid gap-6">
              <SetupGlyph />
              <div>
                <Paragraph intent="lead">
                  {createElement(AppMessage, {
                    message: messages.settingUpYourDeviceIsQuickAnd,
                  })}
                </Paragraph>
                <Paragraph>
                  {createElement(AppMessage, {
                    message: messages.thereAreTwoSimpleStepsSettingUp,
                  })}
                </Paragraph>
                <Paragraph>
                  {createElement(AppMessage, {
                    message: messages.ifYouNeedHelpOrHaveQuestions,
                    values: {
                      link: (chunks) => (
                        <ExternalLink href="mailto:info@networkcanvas.com">
                          {chunks}
                        </ExternalLink>
                      ),
                      link1: (chunks) => (
                        <ExternalLink href="https://community.networkcanvas.com">
                          {chunks}
                        </ExternalLink>
                      ),
                    },
                  })}
                </Paragraph>
              </div>
            </div>
          ),
        },
        {
          title: createElement(AppMessage, {
            message: messages.securingYourData,
          }),
          content: () => (
            <>
              <Paragraph intent="lead">
                {createElement(AppMessage, {
                  message: messages.securingYourResearchDataIsVitalInterviewer,
                })}
              </Paragraph>
              <div className="my-6 grid gap-4">
                <Surface spacing="sm" shadow="sm">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-primary bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-full">
                      <SecureDataGlyph />
                    </span>
                    <Heading level="h4" margin="none">
                      {createElement(AppMessage, {
                        message: messages.secureDataStorage,
                      })}
                    </Heading>
                  </div>
                  <Paragraph margin="none" emphasis="muted" intent="smallText">
                    {createElement(AppMessage, {
                      message:
                        messages.secureDataStorageProtectsYourInterviewData,
                    })}
                  </Paragraph>
                  <Alert variant="info">
                    <AlertTitle>
                      {createElement(AppMessage, {
                        message: messages.goodNews,
                      })}
                    </AlertTitle>
                    <AlertDescription>
                      {createElement(AppMessage, {
                        message: messages.ifYouSetUpAPINPassphrase,
                      })}
                    </AlertDescription>
                  </Alert>
                </Surface>
                <Surface spacing="sm" shadow="sm">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-accent bg-accent/15 flex size-10 shrink-0 items-center justify-center rounded-full">
                      <AuthorisationGlyph />
                    </span>
                    <Heading level="h4" margin="none">
                      {createElement(AppMessage, {
                        message: messages.appAuthorization,
                      })}
                    </Heading>
                  </div>
                  <Paragraph margin="none" emphasis="muted" intent="smallText">
                    {createElement(AppMessage, {
                      message:
                        messages.appAuthorizationEnsuresThatOnlyAuthorizedUsers,
                    })}
                  </Paragraph>
                </Surface>
              </div>
              <Paragraph>
                {createElement(AppMessage, {
                  message: messages.pleaseNoteThatTheseSecurityFeaturesShould,
                  values: { em: (chunks) => <em>{chunks}</em> },
                })}
              </Paragraph>
            </>
          ),
        },
        {
          title: createElement(AppMessage, {
            message: messages.chooseAnAuthenticationMethod,
          }),
          description: createElement(AppMessage, {
            message: messages.chooseBetweenTheOptionsBelowToDetermine,
          }),
          content: () => (
            <Step2MethodPicker lockCommittedMethod={preserveExistingData} />
          ),
        },
        {
          title: createElement(AppMessage, {
            message: messages.setUpYourMethod,
          }),
          content: () => <Step3Configure allowChange={!preserveExistingData} />,
          skip: ({ data }) => data.selectedMethod === 'none',
        },
        {
          title: createElement(AppMessage, { message: messages.lockBehavior }),
          description: createElement(AppMessage, {
            message: messages.decideWhenTheAppReLocks,
          }),
          content: Step4Behavior,
          skip: ({ data }) => data.selectedMethod === 'none',
        },
        {
          title: createElement(AppMessage, {
            message: messages.helpImproveTheApp,
          }),
          content: () => (
            <Step5Analytics initialEnabled={initialAnalyticsEnabled} />
          ),
          nextLabel: createElement(AppMessage, { message: messages.finish }),
        },
      ],
    });

    // Enrolment + settings persistence can fail (e.g. the platform store can't
    // be opened). Surface it instead of leaving the user stranded on the
    // welcome screen with no feedback — they stay on /welcome and can retry.
    try {
      if (!result) {
        // The Settings wizard is optional. Dismissing it must leave the vault
        // exactly as it was so a fresh browser remains unconfigured and still
        // receives mandatory setup if it is later installed.
        if (!preserveExistingData) {
          await enrolWithoutSecurity();
        }
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
        // First-run setup defaults to enabled. A Settings-launched wizard is
        // seeded from the current preference so leaving the toggle untouched
        // preserves an existing opt-out.
        await analytics.setEnabled(
          data.analyticsEnabled ?? initialAnalyticsEnabled,
        );
      }

      if (!preserveExistingData) await refresh();
    } catch (cause) {
      console.error('Security setup failed', cause);
      toast.add({
        title: createElement(AppMessage, {
          message: messages.setupCouldNotBeCompleted,
        }),
        description: createElement(AppMessage, {
          message: messages.somethingWentWrongWhileSettingUpThis,
        }),
        variant: 'destructive',
      });
    } finally {
      // Settings closes before opening the wizard, leaving Home mounted behind
      // it. Always reconcile auth after that flow, even if enrolment succeeded
      // but a later preference write failed; otherwise Home keeps stale
      // unconfigured/no-lock state until reload.
      if (preserveExistingData) {
        try {
          await refresh();
        } catch (cause) {
          console.error('Security setup failed', cause);
          toast.add({
            title: createElement(AppMessage, {
              message: messages.securityStatusCouldNotBeRefreshed,
            }),
            description: createElement(AppMessage, {
              message: messages.reloadInterviewerToRefreshThisDeviceS,
            }),
            variant: 'destructive',
          });
        }
      }
    }
  };

  return { openSetupWizard };
}
