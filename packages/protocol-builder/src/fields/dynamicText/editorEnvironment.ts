import { createContext, useContext } from 'react';

import type { LocaleTag } from '@codaco/protocol-validation';

import type { ConditionDraft } from '../../localization/conditionText.ts';
import type { DynamicValueChoice } from '../../localization/dynamicValueCatalog.ts';
import type { ConditionScope } from '../../rules/ConditionRulesControl.tsx';
import type { ValueNaming } from './valueNaming.ts';

/**
 * The conditions that the text's logic tests, kept beside the text (on the
 * stage, or on a node type's label), and what their rules may be about.
 */
type EditorConditions = Readonly<{
  values: Readonly<Record<string, unknown>>;
  /** Writes them; absent where they are only read. */
  set?: (next: Readonly<Record<string, unknown>>) => void;
  scope: ConditionScope;
  /** Whether rules can be written here at all. */
  writes: boolean;
}>;

/**
 * The dynamic attributes declared beside the text (on the stage, or on a
 * node type's label).
 */
type EditorDynamicAttributes = Readonly<{
  values: Readonly<Record<string, unknown>>;
  /** Writes them; absent where they are only read. */
  set?: (next: Readonly<Record<string, unknown>>) => void;
  /**
   * How many translatable strings of the owner use the dynamic attribute, in
   * any language.
   */
  usageCount: (id: string) => number;
}>;

/**
 * What the views inside a text's editor (logic blocks, their branches, the
 * popovers of dynamic attributes) know about where the text is, read
 * through a context: a node view is given only its own node.
 */
export type DynamicTextEnvironment = Readonly<{
  /**
   * What the text's dynamic attributes and conditions belong to: the stage,
   * or a node type's label.
   */
  owner: 'stage' | 'nodeLabel';
  /** The language being edited. */
  locale: LocaleTag;
  /** The protocol's default language. */
  defaultLocale: LocaleTag;
  naming: ValueNaming;
  /** What text here can show and choose by. */
  choices: readonly DynamicValueChoice[];
  conditions: EditorConditions;
  dynamicAttributes: EditorDynamicAttributes;
  /** Whether the text is a form's, whose logic blocks can contain fields. */
  isForm: boolean;
  /**
   * For the text of a form: the attribute that the field `fieldId` collects,
   * or nothing for a field that has none yet. What a logic block's rules read
   * as answers on the form.
   */
  formFieldVariable?: (fieldId: string) => string | undefined;
  /** Whether the text can be changed. */
  editable: boolean;
  /** A translatable string in the language being edited, with its fallback. */
  labelText: (label: unknown) => string;
  /** A condition's rules as one phrase, or empty for one with none. */
  sentenceOf: (condition: ConditionDraft) => string;
  /**
   * The rules of the condition `conditionId` (of those beside the text) as
   * one phrase, or empty for one with none.
   */
  conditionSentence: (conditionId: string) => string;
  /**
   * The logic block just put in from the toolbar, whose settings open as it
   * is drawn; null otherwise.
   */
  pendingLogicBlock: HTMLElement | null;
  setPendingLogicBlock: (element: HTMLElement | null) => void;
}>;

export const DynamicTextEnvironmentContext =
  createContext<DynamicTextEnvironment | null>(null);

export function useDynamicTextEnvironment(): DynamicTextEnvironment {
  const environment = useContext(DynamicTextEnvironmentContext);
  if (environment === null) {
    throw new Error(
      'A view of a dynamic text editor was drawn outside its editor.',
    );
  }
  return environment;
}
