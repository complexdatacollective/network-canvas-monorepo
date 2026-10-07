/**
 * The contract between the codebook's attribute editor and a host that adds a
 * choice of its own to every option row. Types only, in a module of their own,
 * so the hosts that pass them along — a slot's picker, a create flow — name
 * this rather than the editor, which only the two modules that mount it may.
 */

/**
 * One more choice on every row of an editable options list, which the host
 * defines and is handed back when the editor saves.
 *
 * For a host that keeps something of its own about each option beside the
 * codebook — the kinship words a Family Pedigree gives each gender identity —
 * and wants it chosen on the same row as the option it belongs to. The choices
 * are held here, keyed by the row rather than by its value, so an option whose
 * value is retyped keeps what was chosen for it, a removed option takes its
 * choice with it, and an added one starts on `addedValue`. None of it is
 * written to the codebook: `onComplete` hands the host one entry per saved
 * option, and the host writes them wherever they belong.
 *
 * Not offered on a list this editor cannot change (locked by the interface,
 * or managed by a stage the editor was not opened from): the choices belong to
 * the options, and options nobody here may edit have nothing to choose for.
 */
export type OptionRowChoice = Readonly<{
  /** The field's label on one row. `index` is one-based, passed as text. */
  label(index: string): string;
  choices: readonly Readonly<{ value: string; label: string }>[];
  /** What an option the editor opens with starts on. Read once per open. */
  initialValue(
    option: Readonly<{ label: string; value: string | number }>,
  ): string;
  /** What an option the researcher adds starts on. */
  addedValue: string;
}>;

/** One saved option's value, and the choice made on its row. */
export type OptionRowChoiceValue = Readonly<{
  value: string | number;
  choice: string;
}>;

/**
 * What a host that mounts this editor through a create flow or a stage's own
 * options editor can pass on to it, beyond what every host decides.
 */
export type VariableEditorHostOptions = Readonly<{
  /**
   * The attribute type is the host's to decide: it is shown, read-only, rather
   * than offered as a choice. For a host whose attribute can only ever be one
   * type.
   */
  typeFixed?: boolean;
  optionRowChoice?: OptionRowChoice;
}>;
