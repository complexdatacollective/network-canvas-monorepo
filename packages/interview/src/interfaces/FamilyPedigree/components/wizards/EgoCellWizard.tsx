'use client';

import { AnimatePresence, motion } from 'motion/react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { SkipContext } from '@codaco/fresco-ui/dialogs/DialogProvider';

import { useTrack } from '../../../../analytics/useTrack';
import ActionButton from '../../../../components/ActionButton';
import { useStageSelector } from '../../../../hooks/useStageSelector';
import { useFamilyPedigreeStore } from '../../FamilyPedigreeContext';
import { useFamilyPedigreeDialog } from '../../familyPedigreeDialog';
import { getFramingTerms, type FramingTerms } from '../../framingTerms';
import { messages } from '../../messages';
import type { VariableConfig } from '../../store';
import { getFramingConfig, getIntroScreen } from '../../utils/stageConfig';
import AdditionalParentsStep from '../quickStartWizard/AdditionalParentsStep';
import ChildrenDetailStep from '../quickStartWizard/ChildrenDetailStep';
import EggParentStep from '../quickStartWizard/EggParentStep';
import EgoSexStep from '../quickStartWizard/EgoSexStep';
import {
  FramingSelectionStep,
  shouldSkipFramingSelectionStep,
} from '../quickStartWizard/FramingSelectionStep';
import GestationalCarrierStep from '../quickStartWizard/GestationalCarrierStep';
import IntroStep, { shouldSkipIntroStep } from '../quickStartWizard/IntroStep';
import OtherParentsStep from '../quickStartWizard/OtherParentsStep';
import ParentPartnershipsStep from '../quickStartWizard/ParentPartnershipsStep';
import PartnerAndChildrenStep from '../quickStartWizard/PartnerAndChildrenStep';
import SpermParentStep from '../quickStartWizard/SpermParentStep';
import {
  type EgoCellResult,
  egoCellTransform,
} from './transforms/egoCellTransform';
import { runFamilyPedigreeTransform } from './transforms/personAttributes';

type EgoCellWizardProps = {
  egoId?: string;
  onSubmit: (result: EgoCellResult) => void;
  variableConfig: VariableConfig;
};

// A wizard step title that reflects the currently-selected framing. The framing
// can be chosen inside the wizard (the FramingSelectionStep), so parent-step
// titles must read it live rather than capture it when the steps are built.
// Every dialog opened through `useFamilyPedigreeDialog` has its step titles
// bridged back to the pedigree store, so a stateful title can read it from
// inside the dialog chrome.
function FramingStepTitle({
  termKey,
}: {
  termKey: keyof Pick<
    FramingTerms,
    'eggParent' | 'spermParent' | 'gestationalCarrier'
  >;
}) {
  const intl = useAppIntl();
  const framing = useFamilyPedigreeStore((s) => s.framing);
  return <>{getFramingTerms(framing ?? 'gamete', intl)[termKey]}</>;
}

export default function EgoCellWizard({
  egoId,
  onSubmit,
  variableConfig,
}: EgoCellWizardProps) {
  const intl = useAppIntl();
  const { openDialog } = useFamilyPedigreeDialog();
  const track = useTrack();
  const introScreen = useStageSelector(getIntroScreen);
  const framingConfig = useStageSelector(getFramingConfig);

  const handleClick = async () => {
    const result = await openDialog({
      type: 'wizard',
      title: <AppMessage message={messages.yourBiologicalParents} />,
      className: 'tablet-portrait:min-w-[70ch]',
      progress: null,
      confirmCancel: {
        title: <AppMessage message={messages.closeSetupQuestion} />,
        description: <AppMessage message={messages.closeSetupDescription} />,
        primaryLabel: <AppMessage message={messages.closeLoseProgress} />,
        cancelLabel: <AppMessage message={messages.continueSetup} />,
        intent: 'destructive',
      },
      steps: [
        // IntroStep and FramingSelectionStep depend only on stage config
        // (known now), so include them conditionally rather than relying on a
        // `skip` predicate: the wizard always renders its FIRST step regardless
        // of `skip`, which would otherwise surface an empty IntroStep for a
        // fixed-framing protocol with no intro screen.
        ...(shouldSkipIntroStep(introScreen)
          ? []
          : [
              {
                title: <AppMessage message={messages.introduction} />,
                content: IntroStep,
              },
            ]),
        ...(shouldSkipFramingSelectionStep(framingConfig)
          ? []
          : [
              {
                title: <AppMessage message={messages.referToParents} />,
                content: FramingSelectionStep,
              },
            ]),
        {
          title: <AppMessage message={messages.aboutYou} />,
          content: EgoSexStep,
        },
        {
          title: <FramingStepTitle termKey="eggParent" />,
          content: EggParentStep,
        },
        {
          title: <FramingStepTitle termKey="gestationalCarrier" />,
          content: GestationalCarrierStep,
          skip: ({ getFieldValue }: SkipContext) =>
            getFieldValue('egg-parent.gestationalCarrier') !== false,
        },
        {
          title: <FramingStepTitle termKey="spermParent" />,
          content: SpermParentStep,
        },
        {
          title: <AppMessage message={messages.otherParents} />,
          content: OtherParentsStep,
        },
        {
          title: <AppMessage message={messages.additionalParents} />,
          content: AdditionalParentsStep,
          skip: ({ getFieldValue }: SkipContext) =>
            getFieldValue('hasOtherParents') !== true,
        },
        {
          title: <AppMessage message={messages.parentPartnerships} />,
          content: ParentPartnershipsStep,
        },
        {
          title: <AppMessage message={messages.partnerChildren} />,
          content: PartnerAndChildrenStep,
        },
        {
          title: <AppMessage message={messages.childrenDetails} />,
          content: ChildrenDetailStep,
          skip: ({ getFieldValue }: SkipContext) => {
            if (getFieldValue('hasPartner') !== true) return true;
            return Number(getFieldValue('childrenWithPartnerCount') ?? 0) === 0;
          },
        },
      ],
      onFinish: (formValues: Record<string, unknown>) => {
        return runFamilyPedigreeTransform(() =>
          egoCellTransform(formValues, variableConfig, egoId),
        );
      },
    });

    if (result && typeof result === 'object' && 'batch' in result) {
      onSubmit(result as EgoCellResult);
    } else {
      track('pedigree_wizard_abandoned');
    }
  };

  const variants = {
    initial: { opacity: 0, y: '100%' },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <AnimatePresence>
      <motion.div
        key="get-started-button"
        className="absolute right-12 bottom-4 z-20"
        variants={variants}
        initial="initial"
        animate="animate"
      >
        <ActionButton
          aria-label={intl.formatMessage(messages.buildAccessible)}
          data-testid="pedigree-get-started"
          iconName="Network"
          onClick={handleClick}
        />
      </motion.div>
    </AnimatePresence>
  );
}
