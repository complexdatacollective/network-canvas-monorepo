import { type ComponentProps, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StageType } from '@codaco/protocol-validation';
import { Row, Section } from '~/components/EditorLayout';
import ExternalLink from '~/components/ExternalLink';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
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
 * type being switched away from is a plain event handler; there is no other
 * field reacting to a change here, so no observer effect is needed.
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
        <Row>
          <UnconnectedField
            name="background-type"
            label="Choose a background type"
            component={RichSelectGroupField}
            value={useImage ? 'image' : 'concentric-circles'}
            onChange={handleChooseBackgroundType}
            options={backgroundTypeOptions}
            orientation="horizontal"
          />
        </Row>
      )}
      {!showImage && (
        <>
          <Row>
            <ArchitectField
              name="background.concentricCircles"
              component={IntegerInput}
              validation={{ required: true, positiveNumber: true }}
              label="Number of concentric circles to use:"
              initialValue={concentricCirclesInitialValue}
            />
          </Row>
          <Row>
            <ArchitectField
              name="background.skewedTowardCenter"
              component={ToggleField}
              inline
              label="Skew the size of the circles so that the middle is proportionally larger."
              initialValue={skewedTowardCenterInitialValue ?? false}
            />
          </Row>
        </>
      )}
      {showImage && (
        <>
          <Alert variant="info" className="my-7">
            <AlertTitle>Make the background responsive</AlertTitle>
            <AlertDescription>
              A responsive SVG can span the canvas in portrait and landscape
              while keeping labels readable.{' '}
              <ExternalLink href={documentationLinks.responsiveSvgBackgrounds}>
                Learn how to create a responsive SVG background
              </ExternalLink>
              .
            </AlertDescription>
          </Alert>
          <Row>
            <ArchitectField
              name="background.image"
              component={Image}
              label="Background image"
              labelHidden
              canvasBackgroundPreview
              validation={{ required: true }}
              initialValue={imageInitialValue}
            />
          </Row>
        </>
      )}
    </Section>
  );
};
export default Background;
