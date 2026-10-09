import type { LocaleTag } from '../../localization/localeTag.ts';

/** Text Network Canvas supplies, one ICU message per language it ships in. */
export type SuppliedWording = Readonly<Record<LocaleTag, string>>;

/** One stage setting whose wording Network Canvas supplies. */
export type SuppliedStageSetting = Readonly<{
  /** Where the stage holds the setting. */
  path: readonly string[];
  /** The supplied wording, by language, as ICU messages the stage can hold. */
  message: SuppliedWording;
  /**
   * An optional object the setting belongs to: it is written only into a
   * stage that has it, and arrives with it (the Family Pedigree's
   * completeness texts arrive with `completeness`).
   */
  within?: readonly string[];
  /**
   * A setting the researcher may remove. It is written with the object that
   * holds it, never into one that already exists without it.
   */
  optional?: true;
  /**
   * A setting the stage shows only while it is configured a certain way,
   * such as the Family Pedigree's wording question, asked only when
   * participants choose the wording. It is written while `when` holds, and
   * kept afterwards, so switching back and forth loses no wording; the
   * stage editor writes it when the configuration changes.
   */
  when?: (stage: Readonly<Record<string, unknown>>) => boolean;
}>;
