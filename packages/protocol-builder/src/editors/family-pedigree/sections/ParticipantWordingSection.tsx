import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  EnclosingHeadingLevel,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import {
  type LocalizedString,
  type MessageArguments,
  PEDIGREE_WORDING_ARGUMENTS,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageValidation,
} from '../../../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import {
  PARTICIPANT_WORDING_GROUPS,
  type WordingGate,
  type WordingGroup,
} from './participantWordingSettings.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import { NODE_CONFIGURATION_PATHS } from './pedigreeSlots.ts';

const fieldName = (key: string) => `wording.${key}`;

const groupValue = (group: WordingGroup) => group.id;

const NO_GROUPS: readonly string[] = Object.freeze([]);

/**
 * Every setting the participant sees on this stage, in the words the
 * Family Pedigree's own interface uses, with the wording Network Canvas
 * supplies for each in the protocol's languages.
 *
 * Each group of settings starts closed and has its fields on screen only
 * while it is open: there are dozens, many of them rich-text editors, and
 * mounting them all at once made the editor slow to open. A closed group's
 * settings are still the stage's — the form holds the whole document, and a
 * field that was never mounted leaves its value as the stage holds it — and
 * a setting the stage gains while its group is closed (choosing the framing,
 * asking gender identity) is written with Network Canvas's wording when the
 * stage is saved (see `stageDocument`). An open group's fields start as the
 * stage holds them, or as Network Canvas supplies them, so the section waits
 * for the protocol's languages.
 *
 * A problem never hides in a closed group. A group whose fields are refused
 * stays open until they are put right, and a group holding a setting the
 * protocol refused when the stage was saved opens, so the field that answers
 * for it is on screen beside the refusal.
 */
export default function ParticipantWordingSection() {
  const intl = useAppIntl();
  const { committedFields, storeApi, outline } = useStageEditorForm();
  const supplied = useSuppliedStageWording('FamilyPedigree');
  const framing = useStageValue('framing');
  const genderIdentity = useStageValue(NODE_CONFIGURATION_PATHS.genderIdentity);
  const shown: Readonly<Record<WordingGate, boolean>> = {
    choosesFraming: framing === 'participantPreference',
    asksGenderIdentity: genderIdentity !== undefined,
  };

  const validations = useMemo(
    () =>
      new Map<MessageArguments, CustomFieldValidation>(
        Object.values(PEDIGREE_WORDING_ARGUMENTS).map((declaration) => [
          declaration,
          localizedMessageValidation(declaration, intl),
        ]),
      ),
    [intl],
  );

  const [openGroups, setOpenGroups] = useState<readonly string[]>(NO_GROUPS);

  // A group the schema refused a setting of opens, so the field that answers
  // for the refusal mounts and says it beside itself.
  const issues = useSyncExternalStore(
    outline.subscribe,
    outline.getValidationIssues,
    outline.getValidationIssues,
  );
  useEffect(() => {
    const refused = PARTICIPANT_WORDING_GROUPS.filter((group) =>
      issues.some(
        (issue) =>
          issue.path[0] === 'wording' &&
          group.settings.some((setting) => setting.key === issue.path[1]),
      ),
    ).map(groupValue);
    if (refused.length === 0) return;
    setOpenGroups((current) =>
      refused.every((group) => current.includes(group))
        ? current
        : [...new Set([...current, ...refused])],
    );
  }, [issues]);

  /**
   * Opens at once; closes once the group's fields are known to be right,
   * and not while one is refused. A closed group's fields are not on screen,
   * so a field it closed over while refused — emptied, or written in some
   * versions and not others — could not be pointed to when the stage is
   * saved. The group stays open meanwhile, so asking again only asks again.
   */
  const requestOpenGroups = useCallback(
    (next: readonly string[]) => {
      const opened = next.filter((group) => !openGroups.includes(group));
      const closing = openGroups.filter((group) => !next.includes(group));
      if (opened.length > 0) {
        setOpenGroups((current) => [...new Set([...current, ...opened])]);
      }
      for (const group of closing) {
        const names = (
          PARTICIPANT_WORDING_GROUPS.find(
            (candidate) => groupValue(candidate) === group,
          )?.settings ?? []
        )
          .map((setting) => fieldName(setting.key))
          .filter(
            (name) => storeApi.getState().getFieldState(name) !== undefined,
          );
        void Promise.all(
          names.map((name) => storeApi.getState().validateField(name)),
        ).then(() => {
          const refused = names.some(
            (name) =>
              (storeApi.getState().getFieldErrors(name)?.length ?? 0) > 0,
          );
          if (refused) return;
          setOpenGroups((current) =>
            current.filter((candidate) => candidate !== group),
          );
        });
      }
    },
    [openGroups, storeApi],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.wordingTitle)}
      description={intl.formatMessage(messages.wordingDescription)}
    >
      {supplied !== undefined && (
        <WordingGroups
          openGroups={openGroups}
          onOpenGroupsChange={requestOpenGroups}
          shown={shown}
          committedFields={committedFields}
          supplied={supplied}
          validations={validations}
        />
      )}
    </BuilderSection>
  );
}

type GroupFieldsProps = Readonly<{
  shown: Readonly<Record<WordingGate, boolean>>;
  committedFields: Parameters<typeof startingWording>[0];
  supplied: ReadonlyMap<string, LocalizedString>;
  validations: ReadonlyMap<MessageArguments, CustomFieldValidation>;
}>;

/**
 * The groups, each a heading that opens and closes it. Rendered inside the
 * section, so its headings count from the section's own.
 */
function WordingGroups({
  openGroups,
  onOpenGroupsChange,
  ...fields
}: GroupFieldsProps &
  Readonly<{
    openGroups: readonly string[];
    onOpenGroupsChange: (next: readonly string[]) => void;
  }>) {
  const intl = useAppIntl();
  const headingTag = headingTagBelow(useEnclosingHeadingLevel() ?? 'h3');
  return (
    <Accordion<string>
      multiple
      value={[...openGroups]}
      onValueChange={onOpenGroupsChange}
      className="gap-6"
    >
      {PARTICIPANT_WORDING_GROUPS.map((group) => {
        const value = groupValue(group);
        return (
          <AccordionItem key={value} value={value}>
            <AccordionHeader render={createElement(headingTag)}>
              <AccordionTrigger>
                {intl.formatMessage(group.title)}
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="mt-4">
              {openGroups.includes(value) && (
                <EnclosingHeadingLevel level={headingTag}>
                  <WordingGroupFields group={group} {...fields} />
                </EnclosingHeadingLevel>
              )}
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

/** The fields of one open group: each of its settings the stage shows. */
function WordingGroupFields({
  group,
  shown,
  committedFields,
  supplied,
  validations,
}: GroupFieldsProps & Readonly<{ group: WordingGroup }>) {
  const intl = useAppIntl();
  return group.settings
    .filter((setting) => setting.gate === undefined || shown[setting.gate])
    .map((setting) => {
      const name = fieldName(setting.key);
      const label = intl.formatMessage(setting.label);
      const hint =
        setting.hint === undefined
          ? undefined
          : intl.formatMessage(setting.hint);
      const initialValue = startingWording(committedFields, name, supplied);
      return setting.arguments === undefined ? (
        <Field<typeof LocalizedInputField>
          key={name}
          name={name}
          component={LocalizedInputField}
          label={label}
          hint={hint}
          initialValue={initialValue}
          required={REQUIRED}
        />
      ) : (
        <Field<typeof LocalizedMessageField>
          key={name}
          name={name}
          component={LocalizedMessageField}
          label={label}
          hint={hint}
          arguments={setting.arguments}
          initialValue={initialValue}
          required={REQUIRED}
          custom={validations.get(setting.arguments)}
        />
      );
    });
}
