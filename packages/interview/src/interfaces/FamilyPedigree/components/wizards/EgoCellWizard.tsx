'use client';

import { invariant } from 'es-toolkit';
import { AnimatePresence, motion } from 'motion/react';
import { type ComponentType, useContext } from 'react';

import type { SkipContext } from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { FRAMING_TERMS } from '@codaco/shared-consts';
import { useTrack } from '~/analytics/useTrack';
import ActionButton from '~/components/ActionButton';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  FamilyPedigreeContext,
  FamilyPedigreeStoreBridge,
  useFamilyPedigreeStore,
} from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';
import {
  getFramingConfig,
  getIntroScreen,
} from '~/interfaces/FamilyPedigree/utils/stageConfig';

import AdditionalParentsStep from '../quickStartWizard/AdditionalParentsStep';
import BioParentsIntroStep from '../quickStartWizard/BioParentsIntroStep';
import ChildrenDetailStep from '../quickStartWizard/ChildrenDetailStep';
import EggParentStep from '../quickStartWizard/EggParentStep';
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

type EgoCellWizardProps = {
  egoId?: string;
  onSubmit: (result: EgoCellResult) => void;
  variableConfig: VariableConfig;
};

export default function EgoCellWizard({
  egoId,
  onSubmit,
  variableConfig,
}: EgoCellWizardProps) {
  const { openDialog } = useDialog();
  const track = useTrack();
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const stepTerms = FRAMING_TERMS[framing ?? 'gamete'];
  const introScreen = useStageSelector(getIntroScreen);
  const framingConfig = useStageSelector(getFramingConfig);

  const store = useContext(FamilyPedigreeContext);
  invariant(
    store,
    'EgoCellWizard must be used within a FamilyPedigreeProvider',
  );

  const wrap = (Step: ComponentType) =>
    function BridgedStep() {
      return (
        <FamilyPedigreeStoreBridge store={store}>
          <Step />
        </FamilyPedigreeStoreBridge>
      );
    };

  const handleClick = async () => {
    const result = await openDialog({
      type: 'wizard',
      title: 'Your Biological Parents',
      className: 'tablet-portrait:min-w-[70ch]',
      progress: null,
      steps: [
        // IntroStep and FramingSelectionStep depend only on stage config
        // (known now), so include them conditionally rather than relying on a
        // `skip` predicate: the wizard always renders its FIRST step regardless
        // of `skip`, which would otherwise surface an empty IntroStep for a
        // fixed-framing protocol with no intro screen.
        ...(shouldSkipIntroStep(introScreen)
          ? []
          : [{ title: 'Introduction', content: wrap(IntroStep) }]),
        ...(shouldSkipFramingSelectionStep(framingConfig)
          ? []
          : [
              {
                title: 'Choose your language',
                content: wrap(FramingSelectionStep),
              },
            ]),
        {
          title: 'Your biological parents',
          content: wrap(BioParentsIntroStep),
        },
        {
          title: stepTerms.eggParent,
          content: wrap(EggParentStep),
        },
        {
          title: stepTerms.gestationalCarrier,
          content: wrap(GestationalCarrierStep),
          skip: ({ getFieldValue }: SkipContext) =>
            getFieldValue('egg-parent.gestationalCarrier') !== false,
        },
        {
          title: stepTerms.spermParent,
          content: wrap(SpermParentStep),
        },
        {
          title: 'Other parents',
          content: wrap(OtherParentsStep),
        },
        {
          title: 'Additional parents',
          content: wrap(AdditionalParentsStep),
          skip: ({ getFieldValue }: SkipContext) =>
            getFieldValue('hasOtherParents') !== true,
        },
        {
          title: 'Parent partnerships',
          content: wrap(ParentPartnershipsStep),
        },
        {
          title: 'Partner and children',
          content: wrap(PartnerAndChildrenStep),
        },
        {
          title: 'Children details',
          content: wrap(ChildrenDetailStep),
          skip: ({ getFieldValue }: SkipContext) => {
            if (getFieldValue('hasPartner') !== true) return true;
            return Number(getFieldValue('childrenWithPartnerCount') ?? 0) === 0;
          },
        },
      ],
      onFinish: (formValues: Record<string, unknown>) => {
        return egoCellTransform(formValues, variableConfig, egoId);
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
          aria-label="Build family pedigree"
          iconName="Network"
          onClick={handleClick}
        />
      </motion.div>
    </AnimatePresence>
  );
}
