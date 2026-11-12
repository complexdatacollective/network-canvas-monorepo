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
   * An optional object the setting belongs to: the interview shows the
   * setting only for a stage that has the object (the Family Pedigree's
   * completeness texts belong to `completeness`).
   */
  within?: readonly string[];
  /**
   * A setting the stage shows only while it is configured a certain way,
   * such as the Family Pedigree's wording question, asked only when
   * participants choose the wording. A stage holds wording for it only while
   * `when` holds: saving a stage drops it when the configuration is switched
   * off (see `stageWithoutSuppliedText`).
   */
  when?: (stage: Readonly<Record<string, unknown>>) => boolean;
}>;
