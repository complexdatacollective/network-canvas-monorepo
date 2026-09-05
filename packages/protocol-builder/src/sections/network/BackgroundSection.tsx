import { useCallback, useRef, useState } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useClearStageValue } from '../../form/stageFormHooks.ts';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { IntegerField } from './canvasFields.tsx';

const CIRCLES_FIELD = 'background.concentricCircles';
const SKEW_FIELD = 'background.skewedTowardCenter';
const IMAGE_FIELD = 'background.image';

/**
 * The two backgrounds a canvas can have, and they are mutually exclusive: the
 * stage schema refuses `concentricCircles` alongside an `image`, and refuses a
 * background that is neither.
 */
type BackgroundMode = 'circles' | 'image';

const MODE_OPTIONS: RichSelectOption[] = [
  {
    value: 'circles',
    label: 'Concentric circles',
    description:
      'The conventional sociogram background: rings the participant places nodes within.',
  },
  {
    value: 'image',
    label: 'Image',
    description:
      'A picture of your own — a map, a floor plan, a diagram — filling the canvas.',
  },
];

const WHOLE_NUMBER_MESSAGE =
  'Enter the number of circles as a whole number of zero or more.';

const circlesValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      value === undefined ||
      (typeof value === 'number' && Number.isInteger(value) && value >= 0)
        ? undefined
        : WHOLE_NUMBER_MESSAGE,
  ]),
};

export type BackgroundCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  imageDescription: string;
  modeLabel: string;
  circlesLabel: string;
  circlesHint: string;
  skewLabel: string;
  skewHint: string;
  imageLabel: string;
  imageHint: string;
}>;

const DEFAULT_COPY: BackgroundCopy = {
  sectionTitle: 'Background',
  description:
    'Choose what the participant sees behind the nodes on this canvas.',
  imageDescription:
    'Choose what the participant sees behind the nodes on this canvas: concentric circles, or a picture of your own.',
  modeLabel: 'Background type',
  circlesLabel: 'Number of concentric circles',
  circlesHint:
    'The rings drawn behind the nodes. Participants often use them to place people closer to or further from themselves.',
  skewLabel: 'Make the inner circles larger',
  skewHint:
    'Gives the inner rings more room than the outer ones, so nodes placed near the centre overlap less.',
  imageLabel: 'Background image',
  imageHint:
    'Scaled to fill the canvas. A responsive SVG keeps its labels readable in both portrait and landscape.',
};

export type BackgroundSectionProps = Readonly<{
  /**
   * Whether this interface can draw an image behind its nodes.
   *
   * A semantic capability of the interface rather than a flag read from the
   * stage type: the section is told what its canvas can do, and offers the
   * choice only when there is one to make.
   */
  allowsImage?: boolean;
  copy?: Partial<BackgroundCopy>;
}>;

/**
 * What the participant sees behind the nodes.
 *
 * The stage's `background` and nothing else. The two kinds of background are
 * alternatives rather than settings that coexist — the schema refuses a
 * background holding both, and refuses one holding neither — so switching
 * between them throws away the keys belonging to the kind being left. Nothing
 * is parked "in case they switch back": a key left behind reaches the saved
 * stage and is refused there, against a path, long after the researcher made
 * the choice that created it.
 *
 * The image itself is a protocol resource, chosen through the host's resource
 * gateway. This section never sees a file, a URL or a data store: it holds the
 * asset id the schema spells a background image with.
 */
export default function BackgroundSection({
  allowsImage = false,
  copy,
}: BackgroundSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { committedFields, readOnly } = useStageEditorForm();
  const clearStageValue = useClearStageValue();

  /**
   * The mode the researcher has chosen this session, which outranks the shape
   * of the draft they opened.
   *
   * It has to: switching TO an image shows an empty picker, and a draft with
   * no image in it yet is indistinguishable from a circles background. The
   * override is dropped whenever the agreed draft is replaced beneath the
   * controls — an undo, a collaborator's change, a save — because that draft's
   * own shape is then the newer answer to which mode this stage is in.
   */
  const [override, setOverride] = useState<BackgroundMode | null>(null);
  const seenCommitted = useRef(committedFields);
  if (seenCommitted.current !== committedFields) {
    seenCommitted.current = committedFields;
    setOverride(null);
  }

  const committedMode = modeOfCommittedBackground(committedFields.background);
  const mode: BackgroundMode = allowsImage
    ? (override ?? committedMode)
    : 'circles';

  const chooseMode = useCallback(
    (next: string | number | (string | number)[] | undefined) => {
      const nextMode: BackgroundMode = next === 'image' ? 'image' : 'circles';
      if (nextMode === mode) return;
      // Cleared as the switch happens rather than left to the fields
      // unmounting: a value parked by an unmounted field is replayed into the
      // saved stage, and here that means saving a background of both kinds.
      if (nextMode === 'image') {
        clearStageValue(CIRCLES_FIELD);
        clearStageValue(SKEW_FIELD);
      } else {
        clearStageValue(IMAGE_FIELD);
      }
      setOverride(nextMode);
    },
    [clearStageValue, mode],
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={allowsImage ? words.imageDescription : words.description}
    >
      {allowsImage && (
        <UnconnectedField
          name="background-type"
          label={words.modeLabel}
          component={RichSelectGroupField}
          value={mode}
          onChange={chooseMode}
          options={MODE_OPTIONS}
          orientation="horizontal"
          disabled={readOnly}
        />
      )}
      {mode === 'circles' ? (
        <>
          <ProtocolField<typeof IntegerField>
            name={CIRCLES_FIELD}
            component={IntegerField}
            label={words.circlesLabel}
            hint={words.circlesHint}
            required
            {...circlesValidation}
          />
          <ProtocolField<typeof ToggleField>
            name={SKEW_FIELD}
            component={ToggleField}
            label={words.skewLabel}
            hint={words.skewHint}
            inline
          />
        </>
      ) : (
        <ProtocolField<typeof ResourcePickerControl>
          name={IMAGE_FIELD}
          component={ResourcePickerControl}
          kind="image"
          label={words.imageLabel}
          hint={words.imageHint}
          required
        />
      )}
    </BuilderSection>
  );
}

/**
 * Which background the agreed draft describes.
 *
 * Read from the KEYS rather than from the values, because the values cannot
 * tell the two apart: "an image background whose image is not chosen yet" and
 * "a circles background nobody has filled in" are both empty.
 */
function modeOfCommittedBackground(background: unknown): BackgroundMode {
  if (typeof background !== 'object' || background === null) return 'circles';
  return Object.hasOwn(background, 'image') ? 'image' : 'circles';
}
