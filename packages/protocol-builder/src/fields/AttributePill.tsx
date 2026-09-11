import {
  Calendar,
  CircleDot,
  Hash,
  List,
  ListOrdered,
  MapPin,
  Move,
  SlidersHorizontal,
  ToggleLeft,
  Type,
  type LucideIcon,
} from 'lucide-react';

import Pill from '@codaco/fresco-ui/Pill';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

/**
 * One attribute, shown as the researcher's name for it over the colour and
 * icon of the kind of answer it holds.
 *
 * The kind of answer decides what can be asked about an attribute and what a
 * rule can compare it against, so a picker offering three dozen of them is
 * unreadable without it: a researcher scanning for the rating they authored
 * months ago is looking for an ordinal, and the name alone does not say which
 * names are ordinals.
 *
 * In this package rather than in `@codaco/fresco-ui`, even though the colours
 * it uses are shared theme tokens: what is protocol-specific is the MAPPING —
 * `VariableType` is the protocol schema's vocabulary, and fresco-ui neither
 * depends on `@codaco/protocol-validation` nor should start to for a control
 * only protocol authoring has. The shape is fresco-ui's `Pill`; only the
 * accent and the icon are chosen here.
 *
 * Purely presentational, and deliberately says nothing to a screen reader
 * about the type: where this renders inside a `role="option"`, that row's
 * accessible NAME has to be the attribute's own name, and content inside it is
 * part of that name. The kind of answer is announced by whoever renders the
 * pill — the picker states it beside the held value, the spotlight describes
 * each row with it — so this cannot decide for both.
 */
export type AttributePillProps = Readonly<{
  /** The researcher's own name for the attribute. Never translated. */
  name: string;
  /**
   * The kind of answer it holds. Absent for a row that stands for something
   * other than a codebook attribute — the form-fields list's create sentinel —
   * which is shown plainly rather than dressed as a type it is not.
   */
  type?: VariableType;
  className?: string;
}>;

/**
 * The accent each kind of answer is shown in, and the icon that carries it for
 * anyone who cannot tell the accents apart.
 *
 * The same nine colours Architect has used for these types since the codebook
 * editor was written, so a researcher moving between the two reads one
 * vocabulary. Written as whole class strings because Tailwind reads the class
 * names in the source: a class assembled from a token at runtime is a class
 * the stylesheet never contains.
 */
const TYPE_PRESENTATION: Readonly<
  Record<VariableType, Readonly<{ accent: string; Icon: LucideIcon }>>
> = {
  number: { accent: 'bg-paradise-pink', Icon: Hash },
  text: { accent: 'bg-cerulean-blue', Icon: Type },
  boolean: { accent: 'bg-neon-carrot', Icon: ToggleLeft },
  ordinal: { accent: 'bg-sea-green', Icon: ListOrdered },
  categorical: { accent: 'bg-mustard', Icon: List },
  scalar: { accent: 'bg-kiwi', Icon: SlidersHorizontal },
  datetime: { accent: 'bg-tomato', Icon: Calendar },
  layout: { accent: 'bg-purple-pizazz', Icon: Move },
  location: { accent: 'bg-slate-blue-dark', Icon: MapPin },
};

export default function AttributePill({
  name,
  type,
  className,
}: AttributePillProps) {
  const presentation = type === undefined ? undefined : TYPE_PRESENTATION[type];
  const Icon = presentation?.Icon ?? CircleDot;

  return (
    <Pill
      variant="outline"
      size="lg"
      // Read by tests and by the end-to-end suite as the row's own statement
      // of which kind of answer it holds: an accent is not something a test
      // can assert on without asserting a colour, which is a design decision
      // rather than behaviour.
      data-attribute-type={type}
      className={cx('max-w-full min-w-0 gap-2.5 pl-1', className)}
      icon={
        <span
          className={cx(
            'flex size-7 shrink-0 items-center justify-center rounded-full',
            // A row standing for something that is not an attribute gets the
            // neutral mark: dressing it in one of the nine accents would say
            // it holds a kind of answer it does not hold.
            presentation?.accent ?? 'bg-current/15',
          )}
        >
          <Icon aria-hidden className="size-4 text-white/90" />
        </span>
      }
    >
      <span className="min-w-0 overflow-hidden text-ellipsis">{name}</span>
    </Pill>
  );
}
