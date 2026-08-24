import { useEffect, useRef, useState, type ComponentType } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';

import Audio from '../../Form/Fields/Audio';
import Image from '../../Form/Fields/Image';
import Video from '../../Form/Fields/Video';
import {
  type ContentDraftOutcome,
  getContentTypeChangedAnnouncement,
  getContentTypeChosenAnnouncement,
} from './announcements';
import {
  CONTENT_SLOT_NAMES,
  type ContentSlotType,
  isContentSlotType,
  isManifestAssetType,
} from './itemTypes';
import { sizeOptions, typeOptions } from './options';

const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;

/**
 * The input each content type is edited with. There is deliberately no
 * fallback: a type with no entry here (the ambiguous `'asset'`
 * `denormalizeType` returns for a reference it cannot resolve, or no type
 * chosen yet) gets no content control at all. Falling back to the rich text
 * editor is what used to put an asset id in front of the researcher as prose.
 */
const contentInputs: Record<
  ContentSlotType,
  ComponentType<Record<string, unknown>>
> = {
  text: RichText as ComponentType<Record<string, unknown>>,
  image: Image as ComponentType<Record<string, unknown>>,
  audio: Audio as ComponentType<Record<string, unknown>>,
  video: Video as ComponentType<Record<string, unknown>>,
};

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

const isBlank = (value: unknown) => value === undefined || value === '';

/**
 * What to tell a researcher whose item names a resource this editor can give
 * it no control for. Two unrelated situations reach that same dead end, and
 * which one it is decides what they do next.
 *
 * A reference to nothing needs a replacement file. A reference to a network,
 * GeoJSON or API key resource names a resource that is sitting in Resources
 * right now — it is simply not a medium a content item can present. Telling
 * that researcher their resource is missing would send them hunting for a
 * deletion that never happened. (Architect's own pickers cannot produce that
 * item, because each one filters the resource browser by type; an imported or
 * hand-edited protocol can, because nothing cross-validates a content item's
 * asset reference against the manifest.)
 *
 * Whole sentences rather than an assembled one: these are the strings a
 * translation would have to carry.
 */
const MISSING_RESOURCE_NOTICE =
  'This item’s resource is no longer in this protocol. Choose a content type above to replace it.';
const UNPRESENTABLE_RESOURCE_NOTICE =
  'This item’s resource is not an image, audio or video file, so this item cannot show it. Choose a content type above to replace it.';

/**
 * Announces what became of the item's content each time the researcher chooses
 * or changes its type — the control that appears or is replaced, and the draft
 * that comes back or waits behind, are otherwise visible only to a sighted
 * user.
 *
 * The effect reads the store rather than tracking drafts itself: the store IS
 * the record. By the time a parent's effect runs, the newly mounted slot field
 * has registered and taken back whatever dormant value it had, and the
 * outgoing slot's value is parked in dormant storage where `getFieldState`
 * still finds it.
 */
const useContentTypeChangeAnnouncement = (
  slotType: ContentSlotType | undefined,
) => {
  const getFieldState = useFormStore((store) => store.getFieldState);
  const [announcement, setAnnouncement] = useState('');
  const previousSlotType = useRef(slotType);

  useEffect(() => {
    const previous = previousSlotType.current;
    if (previous === slotType) return;
    previousSlotType.current = slotType;

    // Leaving for a type with no content control of its own (an asset
    // reference that cannot be resolved) removes the section; the notice that
    // replaces it says what to do, so there is nothing to add here.
    if (slotType === undefined) return;

    const hasContent = (type: ContentSlotType) =>
      !isBlank(getFieldState(CONTENT_SLOT_NAMES[type])?.value);

    // No previous type means a control has APPEARED rather than been replaced:
    // the first type chosen for a new item, or the first choice for an item
    // whose saved reference could not be resolved.
    if (previous === undefined) {
      setAnnouncement(getContentTypeChosenAnnouncement(slotType));
      return;
    }

    const outcome: ContentDraftOutcome = hasContent(slotType)
      ? 'restored'
      : hasContent(previous)
        ? 'kept'
        : 'empty';
    setAnnouncement(getContentTypeChangedAnnouncement(slotType, outcome));
  }, [getFieldState, slotType]);

  return announcement;
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
  const slotType = isContentSlotType(resolvedType) ? resolvedType : undefined;
  // The item points at a resource that names no input: `content` is set, but
  // the type `denormalizeType` resolved has no control of its own. Say so — an
  // editor that simply omits the Content section reads as a bug, and the
  // researcher would have no idea their item is broken. The saved type is what
  // says which of the two problems it is (see the notices above); it is safe
  // to read here rather than `resolvedType`, because the only types the type
  // control itself can produce are the four that end this branch.
  const unusableContentNotice =
    slotType !== undefined || !initialContent
      ? undefined
      : isManifestAssetType(initialType)
        ? UNPRESENTABLE_RESOURCE_NOTICE
        : MISSING_RESOURCE_NOTICE;
  const announcement = useContentTypeChangeAnnouncement(slotType);

  return (
    <>
      {/*
        Mounted for the whole dialog, not rendered alongside its first message:
        a live region that appears at the same moment as its text is not
        announced.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <Section layout="vertical">
        <ArchitectField
          name="type"
          label="Content type"
          hint="Choose the type of content this item will show."
          component={FrescoRadioGroupField}
          validation={{ required: true }}
          initialValue={initialType}
          options={typeOptions}
        />
      </Section>
      {unusableContentNotice && (
        <Section title="Content" layout="vertical">
          <Alert variant="warning">
            <AlertDescription>{unusableContentNotice}</AlertDescription>
          </Alert>
        </Section>
      )}
      {slotType && (
        <Section layout="vertical">
          <ArchitectField
            name={CONTENT_SLOT_NAMES[slotType]}
            component={contentInputs[slotType]}
            label="Content"
            hint={`Provide the ${slotType} content for this item. This is what participants will see when they reach this item in the study.`}
            validation={{ required: true }}
            // Only the slot for the type the row was saved as starts from
            // the row's content; every other slot starts empty, which is
            // what keeps an asset id out of the rich text editor.
            initialValue={slotType === initialType ? initialContent : undefined}
          />
        </Section>
      )}
      {allowSize && supportsSize(resolvedType) && (
        <Section layout="vertical" required={false}>
          <ArchitectField
            name="size"
            component={FrescoRadioGroupField}
            label="Display size"
            hint="Optionally constrain the height of this item. Full size lets it display at its natural height."
            initialValue={size ?? ''}
            options={sizeOptions}
            orientation="horizontal"
          />
        </Section>
      )}
    </>
  );
};

export default ItemEditor;
