import { type ComponentType, useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';

import RichTextField from '../../fields/RichTextField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import type { RowEditorProps } from '../rowRenderers.tsx';
import {
  CONTENT_BLOCK_SLOTS,
  contentBlockKindOptions,
  contentBlockSizeOptions,
  type ContentBlockKind,
  type ContentDraftOutcome,
  contentKindChangedAnnouncement,
  contentKindChosenAnnouncement,
  isContentBlockKind,
  pageBlocksCarrySize,
} from './contentBlockTypes.ts';

/**
 * The picker takes an open prop bag from the field wrapper, as every resource
 * field in the package does; `kind` is what says which resources it offers.
 */
const ResourcePicker = ResourcePickerControl as ComponentType<
  Record<string, unknown>
>;

const messages = defineMessages({
  sectionTitle: {
    id: 'protocolBuilder.contentBlock.sectionTitle',
    defaultMessage: 'Block details',
    description:
      'Heading of the dialog where a researcher says what one piece of a page holds and provides it.',
  },
  sectionDescription: {
    id: 'protocolBuilder.contentBlock.sectionDescription',
    defaultMessage:
      'Choose what kind of content this block holds, and provide the content itself.',
    description: 'Description under the block-details heading.',
  },
  kindLabel: {
    id: 'protocolBuilder.contentBlock.kindLabel',
    defaultMessage: 'Content type',
    description:
      'Label of the control choosing what kind of thing one piece of a page holds — a picture, a video, an audio recording, prose.',
  },
  kindHint: {
    id: 'protocolBuilder.contentBlock.kindHint',
    defaultMessage: 'Choose what this block shows the participant.',
    description: 'Guidance under the content-type control.',
  },
  kindRequired: {
    id: 'protocolBuilder.contentBlock.kindRequired',
    defaultMessage: 'Choose what kind of content this block holds.',
    description:
      'Refusal shown under the content-type control when the researcher has chosen nothing.',
  },
  unusableTitle: {
    id: 'protocolBuilder.contentBlock.unusableTitle',
    defaultMessage: 'This block cannot be shown',
    description:
      'Warning heading shown when a piece of a page points at a file the page cannot present.',
  },
  missingResource: {
    id: 'protocolBuilder.contentBlock.missingResource',
    defaultMessage:
      'This block’s resource is no longer in this protocol. Choose a content type above to replace it.',
    description:
      'Warning body shown when a piece of a page points at a file that has been deleted from the protocol, so it needs replacing.',
  },
  unpresentableResource: {
    id: 'protocolBuilder.contentBlock.unpresentableResource',
    defaultMessage:
      'This block’s resource is not an image, audio or video file, so this block cannot show it. Choose a content type above to replace it.',
    description:
      'Warning body shown when a piece of a page points at a file that IS in the protocol but is not something a page can present — a roster of people, a map layer, a key. Distinct from a deleted file, because there is nothing missing to go looking for.',
  },
  contentLabel: {
    id: 'protocolBuilder.contentBlock.contentLabel',
    defaultMessage: 'Content',
    description:
      'Label of the control holding what one piece of a page actually shows, whichever kind it is.',
  },
  textHint: {
    id: 'protocolBuilder.contentBlock.textHint',
    defaultMessage:
      'What the participant reads when they reach this block. Supports markdown formatting.',
    description:
      'Guidance under the control holding the prose of a text block. Markdown is the name of the formatting syntax and is not translated.',
  },
  textPlaceholder: {
    id: 'protocolBuilder.contentBlock.textPlaceholder',
    defaultMessage: 'Enter the text for this block...',
    description:
      'Placeholder shown in the empty prose control of a text block. The trailing dots are an ellipsis written as three full stops.',
  },
  textRequired: {
    id: 'protocolBuilder.contentBlock.textRequired',
    defaultMessage: 'Write the text this block shows.',
    description:
      'Refusal shown under the prose control of a text block when it has been left empty.',
  },
  imageHint: {
    id: 'protocolBuilder.contentBlock.imageHint',
    defaultMessage:
      'The image the participant sees when they reach this block.',
    description:
      'Guidance under the file picker of a block that shows a picture.',
  },
  imageRequired: {
    id: 'protocolBuilder.contentBlock.imageRequired',
    defaultMessage: 'Choose the image this block shows.',
    description:
      'Refusal shown under the file picker of a picture block when nothing has been chosen.',
  },
  audioHint: {
    id: 'protocolBuilder.contentBlock.audioHint',
    defaultMessage:
      'The audio the participant can play when they reach this block.',
    description:
      'Guidance under the file picker of a block that plays an audio recording.',
  },
  audioRequired: {
    id: 'protocolBuilder.contentBlock.audioRequired',
    defaultMessage: 'Choose the audio file this block plays.',
    description:
      'Refusal shown under the file picker of an audio block when nothing has been chosen.',
  },
  videoHint: {
    id: 'protocolBuilder.contentBlock.videoHint',
    defaultMessage:
      'The video the participant can play when they reach this block.',
    description:
      'Guidance under the file picker of a block that plays a video.',
  },
  videoRequired: {
    id: 'protocolBuilder.contentBlock.videoRequired',
    defaultMessage: 'Choose the video this block plays.',
    description:
      'Refusal shown under the file picker of a video block when nothing has been chosen.',
  },
  sizeLabel: {
    id: 'protocolBuilder.contentBlock.sizeLabel',
    defaultMessage: 'Display size',
    description:
      'Label of the control constraining how tall a picture or video is drawn on a page.',
  },
  sizeHint: {
    id: 'protocolBuilder.contentBlock.sizeHint',
    defaultMessage:
      'Optionally constrain the height of this block. Full size lets it show at its natural height.',
    description:
      'Guidance under the display-size control. "Full size" is the wording of the unconstrained choice it offers.',
  },
});

/**
 * What each kind of media block asks for.
 *
 * Whole sentences per kind rather than a noun dropped into a template: the
 * hint is the only place a researcher is told what this control holds, and a
 * translated sentence is not the English one with a word swapped.
 */
const MEDIA_COPY: Readonly<
  Record<
    Exclude<ContentBlockKind, 'text'>,
    Readonly<{ hint: MessageDescriptor; required: MessageDescriptor }>
  >
> = Object.freeze({
  image: Object.freeze({
    hint: messages.imageHint,
    required: messages.imageRequired,
  }),
  audio: Object.freeze({
    hint: messages.audioHint,
    required: messages.audioRequired,
  }),
  video: Object.freeze({
    hint: messages.videoHint,
    required: messages.videoRequired,
  }),
});

/**
 * What a researcher whose block names a resource it can give no control for is
 * told. Two unrelated situations reach the same dead end, and which one it is
 * decides what they do next.
 *
 * A reference to nothing needs a replacement file. A reference to a data file,
 * a map layer or an API key names a resource that is in this protocol right
 * now — it is simply not something a page can present — and telling that
 * researcher their resource is missing would send them hunting for a deletion
 * that never happened.
 */
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * One block of a page: what kind of thing it is, and the thing itself.
 *
 * Rendered inside the shared list's row dialog, so its controls are ordinary
 * connected fields of THAT form — the block is committed whole when the dialog
 * saves, and no part of it is ever registered on the stage.
 *
 * Which control the content is edited with follows from the kind, and only the
 * chosen kind's control is mounted. See `CONTENT_BLOCK_SLOTS` for why each kind
 * keeps its draft separately.
 */
export default function ContentBlockEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const { identity, protocolContext } = useStageEditorForm();
  // The row's own kind until the control has registered, and the control's
  // afterwards: a field's value reaches the store in an effect, so reading only
  // the store would draw the wrong slot for one render, and an existing block
  // would flash without its content control.
  const registered = useFormStore((state) => state.fields.get('type')?.value);
  const chosen = registered ?? item.type;
  const kind = isContentBlockKind(chosen) ? chosen : undefined;
  const announcement = useContentKindAnnouncement(kind, intl);

  // The block points at a resource that names no control: it has content, but
  // the kind it resolved to is not one a page can present. Saying nothing would
  // read as a bug, and the researcher would have no idea their block is broken.
  const unusable =
    kind !== undefined || asString(item.content) === undefined
      ? undefined
      : protocolContext.assets[asString(item.content) ?? ''] === undefined
        ? messages.missingResource
        : messages.unpresentableResource;

  return (
    <Section
      title={intl.formatMessage(messages.sectionTitle)}
      description={intl.formatMessage(messages.sectionDescription)}
    >
      {/* Mounted for the whole dialog rather than beside its first message: a
          live region that appears at the same moment as its text is not
          announced. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <DialogFormField<typeof RadioGroupField>
        name="type"
        component={RadioGroupField}
        label={intl.formatMessage(messages.kindLabel)}
        hint={intl.formatMessage(messages.kindHint)}
        options={contentBlockKindOptions(intl)}
        required={intl.formatMessage(messages.kindRequired)}
      />
      {unusable !== undefined && (
        <Alert variant="warning">
          <AlertTitle>{intl.formatMessage(messages.unusableTitle)}</AlertTitle>
          <AlertDescription>{intl.formatMessage(unusable)}</AlertDescription>
        </Alert>
      )}
      {kind === 'text' && (
        <DialogFormField<typeof RichTextField>
          name={CONTENT_BLOCK_SLOTS.text}
          component={RichTextField}
          label={intl.formatMessage(messages.contentLabel)}
          hint={intl.formatMessage(messages.textHint)}
          placeholder={intl.formatMessage(messages.textPlaceholder)}
          required={intl.formatMessage(messages.textRequired)}
        />
      )}
      {kind !== undefined && kind !== 'text' && (
        <DialogFormField<typeof ResourcePicker>
          name={CONTENT_BLOCK_SLOTS[kind]}
          component={ResourcePicker}
          label={intl.formatMessage(messages.contentLabel)}
          hint={intl.formatMessage(MEDIA_COPY[kind].hint)}
          kind={kind}
          required={intl.formatMessage(MEDIA_COPY[kind].required)}
        />
      )}
      {pageBlocksCarrySize(identity.type) &&
        (kind === 'image' || kind === 'video') && (
          <DialogFormField<typeof RadioGroupField>
            name="size"
            component={RadioGroupField}
            label={intl.formatMessage(messages.sizeLabel)}
            hint={intl.formatMessage(messages.sizeHint)}
            options={contentBlockSizeOptions(intl)}
            orientation="horizontal"
            initialValue={asString(item.size) ?? ''}
          />
        )}
    </Section>
  );
}

/**
 * Announces what became of the block's content each time the researcher
 * chooses or changes its kind.
 *
 * The effect reads the store rather than tracking drafts itself, because the
 * store IS the record: by the time it runs, the newly mounted slot has taken
 * back whatever dormant value it had, and the outgoing slot's value is parked
 * where `getFieldState` still finds it.
 */
function useContentKindAnnouncement(
  kind: ContentBlockKind | undefined,
  intl: IntlShape,
): string {
  const getFieldState = useFormStore((state) => state.getFieldState);
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef(kind);

  useEffect(() => {
    const before = previous.current;
    if (before === kind) return;
    previous.current = kind;

    // Leaving for a kind with no content control of its own — a resource
    // reference that cannot be resolved — removes the control; the notice that
    // replaces it says what to do, so there is nothing to add here.
    if (kind === undefined) return;

    const entered = (candidate: ContentBlockKind) => {
      const value = getFieldState(CONTENT_BLOCK_SLOTS[candidate])?.value;
      return value !== undefined && value !== '';
    };

    // No previous kind means a control has APPEARED rather than been replaced:
    // the first kind chosen for a new block, or the first for a block whose
    // saved reference could not be resolved.
    if (before === undefined) {
      setAnnouncement(contentKindChosenAnnouncement(kind, intl));
      return;
    }

    const outcome: ContentDraftOutcome = entered(kind)
      ? 'restored'
      : entered(before)
        ? 'kept'
        : 'empty';
    setAnnouncement(contentKindChangedAnnouncement(kind, outcome, intl));
  }, [getFieldState, intl, kind]);

  return announcement;
}
