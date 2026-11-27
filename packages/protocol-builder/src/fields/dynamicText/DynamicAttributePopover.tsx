import { Trash2 } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
} from '@codaco/fresco-ui/Popover';

import { useLanguageNaming } from '../../localization/LanguageNaming.tsx';
import {
  DynamicAttributeControls,
  draftProblems,
} from './DynamicAttributeControls.tsx';
import { draftOfDynamicAttribute } from './dynamicAttributeDraft.ts';
import { writeDynamicAttribute } from './dynamicAttributeWrites.ts';
import { useDynamicTextEnvironment } from './editorEnvironment.ts';
import { asDynamicAttribute, valueNamingMessages } from './valueNaming.ts';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.dynamicAttribute.editTitle',
    defaultMessage: 'Dynamic attribute',
    description:
      'Heading of the popover where a researcher edits a dynamic attribute that is already in the text.',
  },
  usedOnStage: {
    id: 'protocolBuilder.dynamicAttribute.usedOnStage',
    defaultMessage:
      'Changes apply everywhere that this dynamic attribute is used on this stage. It is used in {count, plural, one {# place} other {# places}}.',
    description:
      'Note in the popover of a dynamic attribute of a stage. count is how many translatable strings of the stage use it.',
  },
  usedInLabel: {
    id: 'protocolBuilder.dynamicAttribute.usedInLabel',
    defaultMessage:
      'Changes apply everywhere that this dynamic attribute is used in this label. It is used in {count, plural, one {# place} other {# places}}.',
    description:
      'Note in the popover of a dynamic attribute of a node type’s label. count is how many translations of the label use it.',
  },
  otherLanguage: {
    id: 'protocolBuilder.dynamicAttribute.otherLanguage',
    defaultMessage:
      'The logic is the same in every language. The wording that you enter here is used only in {language}.',
    description:
      'Note in the popover of a dynamic attribute while the text is edited in a language that is not the protocol’s default language. language is the name of the language being edited, such as “Spanish”.',
  },
  remove: {
    id: 'protocolBuilder.dynamicAttribute.removeFromText',
    defaultMessage: 'Remove from this wording',
    description:
      'Button in the popover of a dynamic attribute that removes every use of it from the wording being edited, in the language being edited. Other translatable strings that use it, and other languages, keep it.',
  },
});

type DynamicAttributePopoverProps = Readonly<{
  /** The dynamic attribute's id. */
  id: string;
  /** The pill the popover points at. */
  anchor: HTMLElement;
  onClose: () => void;
  /**
   * Removes every pill of the dynamic attribute from the wording being edited.
   */
  onRemove: () => void;
}>;

/**
 * Edits a dynamic attribute from its pill. Each change is written at once,
 * to the one definition that every text beside it shares; the wording is
 * that of the language being edited.
 */
export function DynamicAttributePopover({
  id,
  anchor,
  onClose,
  onRemove,
}: DynamicAttributePopoverProps) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  const { name: languageName } = useLanguageNaming();
  const dynamicAttribute = asDynamicAttribute(
    Object.hasOwn(environment.dynamicAttributes.values, id)
      ? environment.dynamicAttributes.values[id]
      : undefined,
  );
  const otherLanguage = environment.locale !== environment.defaultLocale;
  const draft =
    dynamicAttribute === undefined
      ? undefined
      : draftOfDynamicAttribute(
          dynamicAttribute,
          environment.conditions.values,
        );

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        // No taller than the room in the window, and scrolled within, so
        // that every setting can be reached in a short window. Its parts
        // keep their height and are scrolled to.
        className="flex max-h-(--available-height) w-[min(40rem,90vw)] flex-col gap-4 overflow-y-auto *:shrink-0"
      >
        <PopoverTitle className="text-lg font-semibold">
          {intl.formatMessage(messages.title)}
        </PopoverTitle>
        {draft === undefined ? (
          <p>
            {intl.formatMessage(valueNamingMessages.deletedDynamicAttribute)}
          </p>
        ) : (
          <>
            <Alert variant="info">
              <AlertDescription>
                {otherLanguage
                  ? intl.formatMessage(messages.otherLanguage, {
                      language: languageName(environment.locale),
                    })
                  : intl.formatMessage(
                      environment.owner === 'stage'
                        ? messages.usedOnStage
                        : messages.usedInLabel,
                      {
                        count: environment.dynamicAttributes.usageCount(id),
                      },
                    )}
              </AlertDescription>
            </Alert>
            <DynamicAttributeControls
              name={`dynamic-attribute-${id}`}
              compact
              draft={draft}
              problems={draftProblems(
                draft,
                environment.conditions.scope,
                environment.locale,
                intl,
              )}
              onChange={(next) => writeDynamicAttribute(environment, id, next)}
            />
          </>
        )}
        {environment.editable && (
          <Button
            size="sm"
            variant="text"
            color="destructive"
            icon={<Trash2 aria-hidden />}
            className="self-start"
            onClick={onRemove}
          >
            {intl.formatMessage(messages.remove)}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
