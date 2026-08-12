import { get } from 'es-toolkit/compat';
import { useEffect, useRef, type ComponentType } from 'react';

import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';

import Audio from '../../Form/Fields/Audio';
import Image from '../../Form/Fields/Image';
import Video from '../../Form/Fields/Video';
import { sizeOptions, typeOptions } from './options';

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
  /** Whether to expose the image/video display-size control (Information only). */
  allowSize?: boolean;
  /** The row's own pre-edit values, supplied by DialogArrayField's `item` spread. */
  type?: string;
  content?: string;
  size?: string;
};

/**
 * Resets `content` whenever `type` changes, so switching from e.g. an image to
 * text doesn't leave a stale asset reference under the shared `content` key.
 * An observer effect rather than an `onChange` on the type field — a caller
 * `onChange` would replace `ArchitectField`'s store-connected one and detach
 * the field (see stageFormHooks.ts's cross-field-reactivity note).
 */
const useResetContentOnTypeChange = (type: string | undefined) => {
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const previousType = useRef(type);

  useEffect(() => {
    if (previousType.current !== type) {
      previousType.current = type;
      setFieldValue('content', undefined);
    }
  }, [type, setFieldValue]);
};

const ItemEditor = ({
  allowSize,
  type: initialType,
  content: initialContent,
  size,
}: ItemEditorProps) => {
  const liveType = useFormValue(['type'] as const).type;
  // Falls back to the row's own pre-edit `type` until the field registers
  // (the reactive read is `undefined` for one render on mount), so an
  // existing item's "Content" section isn't briefly hidden.
  const resolvedType =
    typeof liveType === 'string' ? liveType : (initialType ?? undefined);
  useResetContentOnTypeChange(resolvedType);

  return (
    <>
      <Section title="Type" layout="vertical">
        <Row>
          <ArchitectField
            name="type"
            label="Content type"
            labelHidden
            component={FrescoRadioGroupField}
            validation={{ required: true }}
            initialValue={initialType}
            options={typeOptions}
          />
        </Row>
      </Section>
      {resolvedType && (
        <Section title="Content" layout="vertical">
          <Row>
            <ArchitectField
              name="content"
              component={getInputComponent(resolvedType)}
              label="Content"
              labelHidden
              validation={{ required: true }}
              initialValue={initialContent}
            />
          </Row>
        </Section>
      )}
      {allowSize && supportsSize(resolvedType) && (
        <Section
          title="Display size"
          summary="Optionally constrain the height of this item. Full size lets it display at its natural height."
          layout="vertical"
          required={false}
        >
          <Row>
            <ArchitectField
              name="size"
              component={FrescoRadioGroupField}
              label="Display size"
              labelHidden
              initialValue={size ?? ''}
              options={sizeOptions}
              orientation="horizontal"
            />
          </Row>
        </Section>
      )}
    </>
  );
};

export default ItemEditor;
