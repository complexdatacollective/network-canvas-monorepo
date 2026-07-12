import { get } from 'es-toolkit/compat';
import type { ComponentProps, ComponentType } from 'react';

import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { Row, Section } from '~/components/EditorLayout';
import RichText from '~/components/Form/Fields/RichText/Field';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import IssueAnchor from '~/components/IssueAnchor';

import Audio from '../../Form/Fields/Audio';
import Image from '../../Form/Fields/Image';
import Video from '../../Form/Fields/Video';
import ValidatedField from '../../Form/ValidatedField';
import { sizeOptions, typeOptions } from './options';
import withItemHandlers from './withItemHandlers';

const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;

const contentInputs = {
  text: RichText,
  image: Image,
  audio: Audio,
  video: Video,
};

const getInputComponent = (type: string) => get(contentInputs, type, RichText);

// Size is a display treatment for image and video items only; text has no size
// and audio is not visually sized.
const supportsSize = (type: string | undefined) =>
  type === 'image' || type === 'video';

type ItemEditorProps = {
  type?: string;
  /** Whether to expose the image/video display-size control (Information only). */
  allowSize?: boolean;
  handleChangeType: (value: string) => void;
};

const ItemEditor = ({ type, allowSize, handleChangeType }: ItemEditorProps) => (
  <>
    <Section title="Type" layout="vertical">
      <Row>
        <IssueAnchor fieldName="type" description="Content Type" />
        <ValidatedField
          name="type"
          component={FrescoReduxField}
          validation={{ required: true }}
          componentProps={{
            fieldComponent: FrescoRadioGroupField,
            label: 'Content type',
            options: typeOptions,
          }}
          onChange={
            ((_, value) => handleChangeType(value as string)) as ComponentProps<
              typeof ValidatedField
            >['onChange']
          }
        />
      </Row>
    </Section>
    {type && (
      <Section title="Content" layout="vertical">
        <Row>
          <IssueAnchor fieldName="content" description="Content" />
          <ValidatedField
            name="content"
            component={getInputComponent(type)}
            validation={{ required: true }}
          />
        </Row>
      </Section>
    )}
    {allowSize && supportsSize(type) && (
      <Section
        title="Display size"
        summary="Optionally constrain the height of this item. Full size lets it display at its natural height."
        layout="vertical"
        required={false}
      >
        <Row>
          <ValidatedField
            name="size"
            component={FrescoReduxField}
            validation={{}}
            format={(value: unknown) => value ?? ''}
            componentProps={{
              fieldComponent: FrescoRadioGroupField,
              label: 'Display size',
              options: sizeOptions,
              orientation: 'horizontal',
            }}
          />
        </Row>
      </Section>
    )}
  </>
);

export default withItemHandlers(
  ItemEditor as unknown as ComponentType<unknown>,
) as unknown as ComponentType<{ form: string }>;
