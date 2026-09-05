import { type ComponentType, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';

import RichTextField from '../../../fields/RichTextField.tsx';
import { DialogFormField } from '../../../form/DialogForm.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import ResourcePickerControl from '../../../resources/components/ResourcePickerControl.tsx';
import type { RowEditorProps } from '../../../sections/rowRenderers.tsx';
import {
  CONTENT_BLOCK_KIND_OPTIONS,
  CONTENT_BLOCK_SIZE_OPTIONS,
  CONTENT_BLOCK_SLOTS,
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
    Readonly<{ hint: string; required: string }>
  >
> = Object.freeze({
  image: Object.freeze({
    hint: 'The image the participant sees when they reach this block.',
    required: 'Choose the image this block shows.',
  }),
  audio: Object.freeze({
    hint: 'The audio the participant can play when they reach this block.',
    required: 'Choose the audio file this block plays.',
  }),
  video: Object.freeze({
    hint: 'The video the participant can play when they reach this block.',
    required: 'Choose the video this block plays.',
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
const MISSING_RESOURCE_NOTICE =
  'This block’s resource is no longer in this protocol. Choose a content type above to replace it.';

const UNPRESENTABLE_RESOURCE_NOTICE =
  'This block’s resource is not an image, audio or video file, so this block cannot show it. Choose a content type above to replace it.';

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
  const { identity, protocolContext } = useStageEditorForm();
  // The row's own kind until the control has registered, and the control's
  // afterwards: a field's value reaches the store in an effect, so reading only
  // the store would draw the wrong slot for one render, and an existing block
  // would flash without its content control.
  const registered = useFormStore((state) => state.fields.get('type')?.value);
  const chosen = registered ?? item.type;
  const kind = isContentBlockKind(chosen) ? chosen : undefined;
  const announcement = useContentKindAnnouncement(kind);

  // The block points at a resource that names no control: it has content, but
  // the kind it resolved to is not one a page can present. Saying nothing would
  // read as a bug, and the researcher would have no idea their block is broken.
  const unusable =
    kind !== undefined || asString(item.content) === undefined
      ? undefined
      : protocolContext.assets[asString(item.content) ?? ''] === undefined
        ? MISSING_RESOURCE_NOTICE
        : UNPRESENTABLE_RESOURCE_NOTICE;

  return (
    <Section
      title="Block details"
      description="Choose what kind of content this block holds, and provide the content itself."
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
        label="Content type"
        hint="Choose what this block shows the participant."
        options={CONTENT_BLOCK_KIND_OPTIONS}
        required="Choose what kind of content this block holds."
      />
      {unusable !== undefined && (
        <Alert variant="warning">
          <AlertTitle>This block cannot be shown</AlertTitle>
          <AlertDescription>{unusable}</AlertDescription>
        </Alert>
      )}
      {kind === 'text' && (
        <DialogFormField<typeof RichTextField>
          name={CONTENT_BLOCK_SLOTS.text}
          component={RichTextField}
          label="Content"
          hint="What the participant reads when they reach this block. Supports markdown formatting."
          placeholder="Enter the text for this block..."
          required="Write the text this block shows."
        />
      )}
      {kind !== undefined && kind !== 'text' && (
        <DialogFormField<typeof ResourcePicker>
          name={CONTENT_BLOCK_SLOTS[kind]}
          component={ResourcePicker}
          label="Content"
          hint={MEDIA_COPY[kind].hint}
          kind={kind}
          required={MEDIA_COPY[kind].required}
        />
      )}
      {pageBlocksCarrySize(identity.type) &&
        (kind === 'image' || kind === 'video') && (
          <DialogFormField<typeof RadioGroupField>
            name="size"
            component={RadioGroupField}
            label="Display size"
            hint="Optionally constrain the height of this block. Full size lets it show at its natural height."
            options={CONTENT_BLOCK_SIZE_OPTIONS}
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
      setAnnouncement(contentKindChosenAnnouncement(kind));
      return;
    }

    const outcome: ContentDraftOutcome = entered(kind)
      ? 'restored'
      : entered(before)
        ? 'kept'
        : 'empty';
    setAnnouncement(contentKindChangedAnnouncement(kind, outcome));
  }, [getFieldState, kind]);

  return announcement;
}
