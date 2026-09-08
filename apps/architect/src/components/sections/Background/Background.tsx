import { get } from 'es-toolkit/compat';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StageType } from '@codaco/protocol-validation';
import ExternalLink from '~/components/ExternalLink';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import {
  useSetStageValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/store';
import { formatConfig } from '~/i18n/formatConfig';
import { documentationLinks } from '~/utils/documentationLinks';

import Image from '../../Form/Fields/Image';
const additionalMessages = defineMessages({
  aResponsiveSVGCanSpanThe: {
    id: 'architect.additional.sections.background.background.aResponsiveSVGCanSpanThe',
    defaultMessage:
      'A responsive SVG can span the canvas in portrait and landscape while keeping labels readable. <ExternalLink> {value1} </ExternalLink> .',
    description:
      'Visible text in components / sections / Background / Background.',
  },
});
const configMessages = defineMessages({
  concentricCircles: {
    id: 'architect.sections.background.background.config.concentricCircles',
    defaultMessage: 'Concentric Circles',
    description:
      'Presentation label or description in components/sections/Background/Background.tsx. Identifiers are not translated.',
  },
  optionUseTheConventionalConcentricCirclesSociogram: {
    id: 'architect.sections.background.background.config.useTheConventionalConcentricCirclesSociogram',
    defaultMessage:
      'Use the conventional concentric circles sociogram background.',
    description:
      'Presentation label or description in components/sections/Background/Background.tsx. Identifiers are not translated.',
  },
  image: {
    id: 'architect.sections.background.background.config.image',
    defaultMessage: 'Image',
    description:
      'Presentation label or description in components/sections/Background/Background.tsx. Identifiers are not translated.',
  },
  optionUseACustomImageOfYour: {
    id: 'architect.sections.background.background.config.useACustomImageOfYour',
    defaultMessage: 'Use a custom image of your choosing as the background.',
    description:
      'Presentation label or description in components/sections/Background/Background.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  background: {
    id: 'architect.sections.background.background.background',
    defaultMessage: 'Background',
    description:
      'The title text in components / sections / Background / Background.',
  },
  chooseConcentricCirclesOrACustom: {
    id: 'architect.sections.background.background.chooseConcentricCirclesOrACustom',
    defaultMessage:
      'Choose concentric circles or a custom image as the graphical background for this prompt.',
    description:
      'The description text in components / sections / Background / Background.',
  },
  configureTheConcentricCircleBackgroundForThis: {
    id: 'architect.sections.background.background.configureTheConcentricCircleBackgroundForThis',
    defaultMessage:
      'Configure the concentric-circle background for this prompt.',
    description:
      'The description text in components / sections / Background / Background.',
  },
  chooseABackgroundType: {
    id: 'architect.sections.background.background.chooseABackgroundType',
    defaultMessage: 'Choose a background type',
    description:
      'The label text in components / sections / Background / Background.',
  },
  numberOfConcentricCircles: {
    id: 'architect.sections.background.background.numberOfConcentricCircles',
    defaultMessage: 'Number of concentric circles',
    description:
      'The label text in components / sections / Background / Background.',
  },
  skewCircleSizes: {
    id: 'architect.sections.background.background.skewCircleSizes',
    defaultMessage: 'Skew circle sizes',
    description:
      'The label text in components / sections / Background / Background.',
  },
  whenEnabledTheInnerCirclesWill: {
    id: 'architect.sections.background.background.whenEnabledTheInnerCirclesWill',
    defaultMessage:
      'When enabled, the inner circles will be proportionally larger than the outer circles, which can help reduce overlap of nodes in the center of the canvas.',
    description:
      'The hint text in components / sections / Background / Background.',
  },
  backgroundImage: {
    id: 'architect.sections.background.background.backgroundImage',
    defaultMessage: 'Background image',
    description:
      'The label text in components / sections / Background / Background.',
  },
  chooseAnImageToUseAs: {
    id: 'architect.sections.background.background.chooseAnImageToUseAs',
    defaultMessage:
      'Choose an image to use as the background for this prompt. The image will be scaled to fit the canvas.',
    description:
      'Visible text in components / sections / Background / Background.',
  },
  learnHowToCreateAResponsive: {
    id: 'architect.sections.background.background.learnHowToCreateAResponsive',
    defaultMessage: 'Learn how to create a responsive SVG background',
    description:
      'Visible text in components / sections / Background / Background.',
  },
});

const backgroundTypeOptions = [
  {
    value: 'concentric-circles',
    label: configMessages.concentricCircles,
    description:
      configMessages.optionUseTheConventionalConcentricCirclesSociogram,
  },
  {
    value: 'image',
    label: configMessages.image,
    description: configMessages.optionUseACustomImageOfYour,
  },
];

const interfacesWithBackgroundImages: readonly StageType[] = [
  'Narrative',
  'Sociogram',
  'NetworkComposer',
];

export const allowsBackgroundImage = (interfaceType: StageType): boolean =>
  interfacesWithBackgroundImages.includes(interfaceType);

/**
 * `InputField` always emits the raw typed string (fresco-ui has no
 * `parse`/`format` hook), so the number the stage schema expects has to be
 * bridged at this specific field.
 */
const IntegerInput = ({
  value,
  onChange,
  ...props
}: {
  value?: number;
  onChange?: (value: number | undefined) => void;
} & Omit<ComponentProps<typeof InputField>, 'value' | 'onChange' | 'type'>) => (
  <InputField
    {...props}
    type="number"
    value={value === undefined ? '' : String(value)}
    onChange={(raw) => {
      const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
      onChange?.(Number.isNaN(parsed) ? undefined : parsed);
    }}
  />
);

/**
 * The `withBackgroundChangeHandler` replacement: which of the two mutually
 * exclusive field groups is showing is local state, seeded once from the
 * committed value (`withState`'s `({useImage}) => useImage` initializer) —
 * it has to stay local rather than track `background.image` live, because
 * switching TO image mode must show the (still-empty) picker immediately,
 * before any image has actually been chosen. Clearing the fields for the
 * type being switched away from is a plain event handler.
 *
 * Undo/redo is the one thing that has to reach that local state (see the
 * restore effect below): a restore writes the background's LEAVES, and which
 * group they belong to exists nowhere but here.
 */
const Background = ({ interfaceType }: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const setStageValue = useSetStageValue();
  const imageAllowed = allowsBackgroundImage(interfaceType);

  const concentricCirclesInitialValue = useStageInitialValue<number>(
    'background.concentricCircles',
  );
  const skewedTowardCenterInitialValue = useStageInitialValue<boolean>(
    'background.skewedTowardCenter',
  );
  const imageInitialValue = useStageInitialValue<string>('background.image');

  const [useImage, setUseImage] = useState(
    () => imageAllowed && !!imageInitialValue,
  );
  const showImage = imageAllowed && useImage;

  // Undo/redo writes the background's LEAVES and nothing else, so without this
  // a step is a visible no-op: the obsolete group stays on screen, the
  // restored values land in the unmounted sibling's dormant storage where
  // nothing registers them, and `getFormValues()` — what the save and the
  // Preview mirror read — reports a background with neither group in it.
  //
  // The mode is read off the restored snapshot's SHAPE rather than its values.
  // `getFormValues()` reports registered fields only, so the snapshot carries
  // a `background.image` key exactly when the picker was the mounted group
  // when it was taken, and the circle keys exactly when it was not. The values
  // cannot make that distinction: "image chosen, none picked yet" and
  // "concentric circles, nothing filled in yet" are both all-undefined, and
  // guessing wrong there leaves the form's values disagreeing with the entry
  // that was just restored — which the next step flushes as a new snapshot,
  // silently branching the timeline and discarding the redo.
  //
  // Read imperatively at restore time: subscribing would re-render the section
  // on every snapshot the whole editor takes, for a value it only ever looks
  // at here.
  const reduxStore = useStore<RootState>();
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersionRef = useRef(restoreVersion);
  useEffect(() => {
    const previousRestoreVersion = previousRestoreVersionRef.current;
    previousRestoreVersionRef.current = restoreVersion;

    // A restore, and ONLY a restore — which also excludes the mount. Reacting
    // to the values themselves would throw the user straight back out of image
    // mode the instant they chose it, since no image exists at that point;
    // that is the whole reason the mode is local state. Neither `ui.restoring`
    // nor the bridge's ref can stand in for the counter: both are only true
    // *inside* `runRestore`, which has finished by the time an effect observing
    // its writes runs (see `useStageRestoreVersion`).
    if (previousRestoreVersion === restoreVersion) return;

    // `present` is the entry being restored: `useStageDraftHistory` dispatches
    // the timeline step before it applies the values, in the same batch.
    const restored = get(
      reduxStore.getState().stageEditorDraft.history.present?.stage ?? {},
      'background',
    ) as Record<string, unknown> | undefined;

    if (!restored) return;

    if ('image' in restored) {
      setUseImage(true);
      return;
    }

    if ('concentricCircles' in restored || 'skewedTowardCenter' in restored) {
      setUseImage(false);
    }
  }, [restoreVersion, reduxStore]);

  const handleChooseBackgroundType = (
    value: string | number | (string | number)[] | undefined,
  ) => {
    const nextUseImage = value === 'image';
    if (nextUseImage === useImage) return;

    if (nextUseImage) {
      setStageValue('background.concentricCircles', undefined);
      setStageValue('background.skewedTowardCenter', undefined);
    } else {
      setStageValue('background.image', undefined);
    }
    setUseImage(nextUseImage);
  };

  return (
    <Section
      title={intl.formatMessage(messages.background)}
      description={
        imageAllowed
          ? intl.formatMessage(messages.chooseConcentricCirclesOrACustom)
          : intl.formatMessage(
              messages.configureTheConcentricCircleBackgroundForThis,
            )
      }
    >
      {imageAllowed && (
        <UnconnectedField
          name="background-type"
          label={intl.formatMessage(messages.chooseABackgroundType)}
          component={RichSelectGroupField}
          value={useImage ? 'image' : 'concentric-circles'}
          onChange={handleChooseBackgroundType}
          options={formatConfig(backgroundTypeOptions, intl)}
          orientation="horizontal"
        />
      )}
      {!showImage && (
        <ArchitectField
          name="background.concentricCircles"
          component={IntegerInput}
          validation={{ required: true, positiveNumber: true }}
          label={intl.formatMessage(messages.numberOfConcentricCircles)}
          initialValue={concentricCirclesInitialValue}
          inline
        />
      )}
      {!showImage && (
        <ArchitectField
          name="background.skewedTowardCenter"
          component={ToggleField}
          inline
          label={intl.formatMessage(messages.skewCircleSizes)}
          hint={intl.formatMessage(messages.whenEnabledTheInnerCirclesWill)}
          initialValue={skewedTowardCenterInitialValue ?? false}
        />
      )}
      {showImage && (
        <ArchitectField
          name="background.image"
          component={Image}
          label={intl.formatMessage(messages.backgroundImage)}
          hint={
            <>
              <Paragraph>
                {intl.formatMessage(messages.chooseAnImageToUseAs)}
              </Paragraph>
              <Paragraph>
                {intl.formatMessage(
                  additionalMessages.aResponsiveSVGCanSpanThe,
                  {
                    value1: intl.formatMessage(
                      messages.learnHowToCreateAResponsive,
                    ),
                    ExternalLink: (chunks) => (
                      <ExternalLink
                        href={documentationLinks.responsiveSvgBackgrounds}
                      >
                        {chunks}
                      </ExternalLink>
                    ),
                  },
                )}
              </Paragraph>
            </>
          }
          canvasBackgroundPreview
          validation={{ required: true }}
          initialValue={imageInitialValue}
        />
      )}
    </Section>
  );
};
export default Background;
