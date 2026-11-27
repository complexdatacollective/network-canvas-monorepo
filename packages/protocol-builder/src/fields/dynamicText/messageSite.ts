import type {
  DynamicValueConditions,
  DynamicValueDynamicAttributes,
  DynamicValueSiteState,
} from '../../localization/useDynamicValueSite.ts';

/**
 * What a text's editor knows about where the text sits: what it can show
 * there, the conditions its logic can test, and the dynamic attributes
 * declared beside it.
 */
export type DynamicMessageSite = Readonly<{
  context: DynamicValueSiteState['context'];
  /**
   * The conditions the text can test, and what their rules may be about.
   * Without `set` they are read, to say what each “If” tests, and never
   * written.
   */
  conditions?: Omit<DynamicValueConditions, 'set'> &
    Readonly<{ set?: DynamicValueConditions['set'] }>;
  /**
   * The dynamic attributes declared beside the text. Without `set` they are
   * read, to draw their pills, and never written.
   */
  dynamicAttributes?: Omit<DynamicValueDynamicAttributes, 'set'> &
    Readonly<{ set?: DynamicValueDynamicAttributes['set'] }>;
  /**
   * What the conditions and dynamic attributes belong to; the stage when
   * absent.
   */
  owner?: 'stage' | 'nodeLabel';
  /**
   * How many translatable strings of the owner use the dynamic attribute
   * `id`, in any language. One when absent.
   */
  dynamicAttributeUsage?: (id: string) => number;
}>;
