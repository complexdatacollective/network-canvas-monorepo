import type { ComponentType } from 'react';
import { PureComponent } from 'react';
import { compose } from 'react-recompose';
import { Field } from 'redux-form';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StageType } from '@codaco/protocol-validation';
import { Row, Section } from '~/components/EditorLayout';
import Toggle from '~/components/Form/Fields/Toggle';
import FrescoReduxField, {
  reduxIntegerValue,
} from '~/components/Form/FrescoReduxField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import Image from '../../Form/Fields/Image';
import ValidatedField from '../../Form/ValidatedField';
import withBackgroundChangeHandler from './withBackgroundChangeHandler';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

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
type BackgroundProps = StageEditorSectionProps & {
  handleChooseBackgroundType: (value: boolean) => void;
  useImage: boolean;
};
class Background extends PureComponent<BackgroundProps> {
  render() {
    const { handleChooseBackgroundType, useImage, interfaceType } = this.props;
    const imageAllowed = allowsBackgroundImage(interfaceType);
    const showImage = imageAllowed && useImage;
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
            <Heading level="h4">Choose a background type</Heading>
            <RichSelectGroupField
              aria-label="Choose a background type"
              value={useImage ? 'image' : 'concentric-circles'}
              options={backgroundTypeOptions}
              orientation="horizontal"
              onChange={(value) => {
                const nextUseImage = value === 'image';
                if (nextUseImage !== useImage) {
                  handleChooseBackgroundType(nextUseImage);
                }
              }}
            />
          </Row>
        )}
        {!showImage && (
          <>
            <Row>
              <IssueAnchor
                fieldName="background.concentricCircles"
                description="Background > Concentric Circles"
              />
              <ValidatedField
                name="background.concentricCircles"
                component={FrescoReduxField}
                normalize={(value) => Number.parseInt(value, 10) || value}
                validation={{ required: true, positiveNumber: true }}
                label="Number of concentric circles to use:"
                componentProps={{
                  fieldComponent: FrescoInputField,
                  type: 'number',
                  ...reduxIntegerValue,
                }}
              />
            </Row>
            <Row>
              <Field
                name="background.skewedTowardCenter"
                component={Toggle}
                label="Skew the size of the circles so that the middle is proportionally larger."
              />
            </Row>
          </>
        )}
        {showImage && (
          <Row>
            <IssueAnchor
              fieldName="background.image"
              description="Background > Image"
            />
            <ValidatedField
              name="background.image"
              component={Image as React.ComponentType<Record<string, unknown>>}
              validation={{ required: true }}
              componentProps={{
                label: 'Background image',
                labelHidden: true,
              }}
            />
          </Row>
        )}
      </Section>
    );
  }
}
export default compose<BackgroundProps, StageEditorSectionProps>(
  withBackgroundChangeHandler,
)(Background);
