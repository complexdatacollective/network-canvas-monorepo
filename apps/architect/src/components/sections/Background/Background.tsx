import { get } from 'es-toolkit/compat';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StageType } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import ExternalLink from '~/components/ExternalLink';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import {
  useSetStageValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/store';
import { documentationLinks } from '~/utils/documentationLinks';

import Image from '../../Form/Fields/Image';

const backgroundTypeOptions = [
  {
    value: 'concentric-circles',
    label: 'Concentric Circles',
    description:
      'Use the conventional concentric circles sociogram background.',
  },
  {
    value: 'image',
    label: 'Image',
    description: 'Use a custom image of your choosing as the background.',
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
      title="Background"
      summary={
        <Paragraph>
          This section determines the graphical background for this prompt.
          {imageAllowed
            ? ' You can choose between a conventional series of concentric circles, or provide your own background image.'
            : ' This stage uses the conventional series of concentric circles.'}
        </Paragraph>
      }
    >
      {imageAllowed && (
        <UnconnectedField
          name="background-type"
          label="Choose a background type"
          component={RichSelectGroupField}
          value={useImage ? 'image' : 'concentric-circles'}
          onChange={handleChooseBackgroundType}
          options={backgroundTypeOptions}
          orientation="horizontal"
        />
      )}
      {!showImage && (
        <ArchitectField
          name="background.concentricCircles"
          component={IntegerInput}
          validation={{ required: true, positiveNumber: true }}
          label="Number of concentric circles to use:"
          initialValue={concentricCirclesInitialValue}
          inline
        />
      )}
      {!showImage && (
        <ArchitectField
          name="background.skewedTowardCenter"
          component={ToggleField}
          inline
          label="Skew circle size?"
          hint="When enabled, the inner circles will be proportionally larger than the outer circles, which can help reduce overlap of nodes in the center of the canvas."
          initialValue={skewedTowardCenterInitialValue ?? false}
        />
      )}
      {showImage && (
        <ArchitectField
          name="background.image"
          component={Image}
          label="Background image"
          hint={
            <>
              <Paragraph>
                Choose an image to use as the background for this prompt. The
                image will be scaled to fit the canvas.
              </Paragraph>
              <Paragraph>
                {' '}
                A responsive SVG can span the canvas in portrait and landscape
                while keeping labels readable.{' '}
                <ExternalLink
                  href={documentationLinks.responsiveSvgBackgrounds}
                >
                  Learn how to create a responsive SVG background
                </ExternalLink>
                .
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
