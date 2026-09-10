import { ArrowLeft, FlaskConical } from 'lucide-react';
import { useCallback, useId, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { ToolbarButton } from '@codaco/fresco-ui/SegmentedToolbar';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useActionToolbar } from '~/components/ProjectNav/ActionToolbar';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import { useAppDispatch } from '~/ducks/hooks';
import { actionCreators } from '~/ducks/modules/activeProtocol';
import { getExperiments } from '~/selectors/protocol';
import { cx } from '~/utils/cva';
const messages = defineMessages({
  experimentsActions: {
    id: 'architect.pages.experimentsPage.experimentsActions',
    defaultMessage: 'Experiments actions',
    description:
      "The 'aria-label' text in components / pages / ExperimentsPage.",
  },
  goBack: {
    id: 'architect.pages.experimentsPage.goBack',
    defaultMessage: 'Go Back',
    description: 'Visible text in components / pages / ExperimentsPage.',
  },
  experimentalFeatures: {
    id: 'architect.pages.experimentsPage.experimentalFeatures',
    defaultMessage: 'Experimental Features',
    description: 'Visible text in components / pages / ExperimentsPage.',
  },
  theseFeaturesAreExperimentalAndMay: {
    id: 'architect.pages.experimentsPage.theseFeaturesAreExperimentalAndMay',
    defaultMessage:
      'These features are experimental and may not be fully supported.',
    description: 'Visible text in components / pages / ExperimentsPage.',
  },
  encryptedAttributes: {
    id: 'architect.pages.experimentsPage.encryptedAttributes',
    defaultMessage: 'Encrypted Attributes',
    description: 'Visible text in components / pages / ExperimentsPage.',
  },
  enableSupportForEncryptedAttributesIn: {
    id: 'architect.pages.experimentsPage.enableSupportForEncryptedAttributesIn',
    defaultMessage:
      'Enable support for encrypted attributes in the codebook. This allows sensitive data to be collected securely.',
    description: 'Visible text in components / pages / ExperimentsPage.',
  },
});

const ExperimentsPage = () => {
  const intl = useAppIntl();
  const encryptedVariablesLabelId = useId();
  const [, setLocation] = useLocation();
  const dispatch = useAppDispatch();
  const experiments = useSelector(getExperiments) ?? {};
  const handleGoBack = useCallback(() => {
    setLocation('/protocol');
  }, [setLocation]);
  // Published to the one toolbar surface the workspace owns rather than
  // rendered here, so leaving this page animates these controls out as the next
  // route's animate in — and so two fixed toolbars can never share a screen.
  // Memoised because `useActionToolbar` re-registers on every new props
  // identity.
  const toolbarProps = useMemo(
    () => ({
      'aria-label': intl.formatMessage(messages.experimentsActions),
      'children': [
        <ToolbarButton
          key="go-back"
          icon={<ArrowLeft />}
          onClick={handleGoBack}
        >
          {intl.formatMessage(messages.goBack)}
        </ToolbarButton>,
      ],
    }),
    [handleGoBack, intl],
  );
  useActionToolbar(toolbarProps);
  const handleToggleExperiment = (key: string, checked: boolean) => {
    dispatch(
      actionCreators.updateProtocol({
        experiments: { ...experiments, [key]: checked },
      }),
    );
  };
  // No "no protocol loaded" branch: ProtocolRouteGuard sends a /protocol route
  // with no protocol home before this page renders, so a second, weaker guard
  // here would only be another place for the two to disagree.
  const isEncryptedEnabled = experiments.encryptedVariables ?? false;
  return (
    <div className="relative h-full overflow-y-auto pb-32 print:h-auto print:overflow-visible print:pb-0">
      <div className="phone-landscape:px-7 tablet-landscape:px-29 mx-auto my-10 flex max-w-7xl flex-col gap-6 px-5">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <div className="bg-mustard/20 rounded-lg p-2">
              <FlaskConical className="text-mustard h-6 w-6" />
            </div>
            <Heading level="h1" {...routeFocusTargetProps}>
              {intl.formatMessage(messages.experimentalFeatures)}
            </Heading>
          </div>
          <Paragraph>
            {intl.formatMessage(messages.theseFeaturesAreExperimentalAndMay)}
          </Paragraph>
        </div>

        <div className="flex flex-col gap-4">
          <div
            className={cx(
              'flex items-center gap-4 rounded border border-transparent p-4 transition-colors',
              isEncryptedEnabled
                ? 'border-sea-green/50 bg-sea-green/10'
                : 'bg-surface-1',
            )}
          >
            <div className="min-w-0 flex-1">
              <Heading level="h4" id={encryptedVariablesLabelId}>
                {intl.formatMessage(messages.encryptedAttributes)}
              </Heading>
              <Paragraph className="text-sm text-current/70">
                {intl.formatMessage(
                  messages.enableSupportForEncryptedAttributesIn,
                )}
              </Paragraph>
            </div>
            <ToggleField
              // A bare `<button role="switch">` takes its name from
              // aria-labelledby, aria-label, its own contents or `title` —
              // and this one has none of those, so it reached assistive
              // technology as an unnamed switch. The feature's heading is
              // its name.
              aria-labelledby={encryptedVariablesLabelId}
              value={isEncryptedEnabled}
              onChange={(checked) =>
                handleToggleExperiment('encryptedVariables', !!checked)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
export default ExperimentsPage;
