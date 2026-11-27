import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { RichTextInsertState } from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { presentationalTextValue } from '@codaco/fresco-ui/PresentationalText';
import type { DynamicValueRole } from '@codaco/protocol-validation';

import {
  type DynamicValueChoice,
  isFlagChoice,
} from '../../localization/dynamicValueCatalog.ts';
import { attributeGroupMessages } from '../attributeGroups.ts';
import type { VariablePickerOption } from '../VariablePickerField.tsx';
import VariablePickerList, {
  type VariablePickerGroup,
} from '../VariablePickerList.tsx';
import { variablePillKindOf } from '../VariablePill.tsx';
import {
  ATTRIBUTE_MENU_LABEL,
  AttributeMenuButton,
  useAttributeMenuState,
} from './AttributeMenuButton.tsx';
import { DynamicAttributeDialog } from './DynamicAttributeDialog.tsx';
import { dynamicAttributeName } from './dynamicAttributeWrites.ts';
import {
  type DynamicTextEnvironment,
  useDynamicTextEnvironment,
} from './editorEnvironment.ts';

const messages = defineMessages({
  createDynamicAttribute: {
    id: 'protocolBuilder.attributeMenu.createDynamicAttribute',
    defaultMessage: 'Create dynamic attribute',
    description:
      'Row at the end of the “Dynamic attributes” group of the attribute list in a text editor. It opens a dialog where the researcher creates a dynamic attribute: a word or phrase that reads differently in different cases, such as “his”, “her” or “their”.',
  },
  needsAnswerLabels: {
    id: 'protocolBuilder.dynamicText.needsAnswerLabels',
    defaultMessage: 'Add labels for its yes and no answers first',
    description:
      'Second line of an entry in the insert-a-value menu that cannot be chosen yet. The entry is a yes-or-no attribute without its own words for its two answers, so the text has nothing in the protocol’s languages to show for it. The researcher can add those words where the attribute is set up.',
  },
  switchHasNoLabels: {
    id: 'protocolBuilder.attributeMenu.switchHasNoLabels',
    defaultMessage:
      'A Toggle has no labels for its answers. Use a dynamic attribute instead.',
    description:
      'Shown under an entry in the attribute list of a text editor that cannot be chosen. The entry is a yes-or-no attribute answered with a Toggle (Architect’s name for a single on/off switch, kept as the one word “Toggle” as elsewhere in Architect), which has no labels for its two answers, so the text cannot show the answer itself. A dynamic attribute can show different wording for each answer.',
  },
});

/** The group of the attribute list that a value is listed in. */
type GroupId =
  | 'node'
  | 'edge'
  | 'firstNode'
  | 'secondNode'
  | 'ego'
  | 'dynamic'
  | 'interview';

const GROUP_ORDER: readonly GroupId[] = [
  'node',
  'edge',
  'firstNode',
  'secondNode',
  'ego',
  'dynamic',
  'interview',
];

const groupOfRole = (role: DynamicValueRole | undefined): GroupId => {
  switch (role) {
    case undefined:
      return 'interview';
    case 'ego':
      return 'ego';
    case 'edge':
      return 'edge';
    case 'dyadSource':
    case 'edgeFrom':
      return 'firstNode';
    case 'dyadTarget':
    case 'edgeTo':
      return 'secondNode';
    case 'node':
    case 'focal':
    default:
      return 'node';
  }
};

const unavailableReasonOf = (
  intl: IntlShape,
  choice: DynamicValueChoice,
): string | undefined => {
  switch (choice.unshowable) {
    case 'needsLabels':
      return intl.formatMessage(messages.needsAnswerLabels);
    case 'switch':
      return intl.formatMessage(messages.switchHasNoLabels);
    case undefined:
    default:
      return undefined;
  }
};

/**
 * The groups of the attribute list: each value that text here can show,
 * under the heading of whose it is, then the dynamic attributes declared
 * beside the text, then the interview's own values. A value that cannot be
 * shown stays in its place, with the reason.
 */
const attributeMenuGroups = (
  intl: IntlShape,
  environment: DynamicTextEnvironment,
  onCreate: (() => void) | undefined,
): VariablePickerGroup[] => {
  const options = new Map<GroupId, VariablePickerOption[]>(
    GROUP_ORDER.map((id) => [id, []]),
  );
  for (const choice of environment.choices) {
    // Whether a node is the participant, and a condition, only choose
    // wording; neither is ever shown.
    if (isFlagChoice(choice)) continue;
    const type = variablePillKindOf(choice.variableType);
    const reason = unavailableReasonOf(intl, choice);
    options
      .get(choice.ownNode === true ? 'node' : groupOfRole(choice.role))
      ?.push({
        value: choice.name,
        label: presentationalTextValue(environment.naming.valueLabel(choice)),
        ...(type !== undefined && { type }),
        ...(reason !== undefined && { unavailableReason: reason }),
      });
  }
  options.set(
    'dynamic',
    Object.keys(environment.dynamicAttributes.values).map((id) => {
      const name = dynamicAttributeName(id);
      return {
        value: name,
        label: environment.naming.pillFor(name).name,
      };
    }),
  );
  const canCreate =
    onCreate !== undefined &&
    environment.editable &&
    environment.dynamicAttributes.set !== undefined;
  return GROUP_ORDER.flatMap((id): VariablePickerGroup[] => {
    const listed = options.get(id) ?? [];
    const actions =
      id === 'dynamic' && canCreate
        ? [
            {
              id: 'create-dynamic-attribute',
              label: intl.formatMessage(messages.createDynamicAttribute),
              onSelect: onCreate,
            },
          ]
        : [];
    if (listed.length === 0 && actions.length === 0) return [];
    return [
      {
        id,
        label: intl.formatMessage(attributeGroupMessages[id]),
        options: listed,
        actions,
      },
    ];
  });
};

/**
 * The Attribute button of a text editor's toolbar, and the list it opens:
 * every value that text here can show, the dynamic attributes declared beside
 * the text, and a row that creates one. The list also opens where `{` is
 * typed, and the value chosen then replaces the `{`.
 */
export function AttributeMenu({
  insert,
}: Readonly<{ insert: RichTextInsertState }>) {
  const { commands } = insert;
  const state = useAttributeMenuState(insert);
  const [creating, setCreating] = useState(false);
  // Read by the list's request to close, which comes in the same event as
  // the request to create, before the state has changed.
  const creatingNow = useRef(false);
  // The dialog goes here and now, rather than as the event ends: while it is
  // open the rest of the page is inert, so the text cannot take the keyboard
  // back until it has gone, and keys typed in between would reach nothing.
  const closeDialog = () => {
    creatingNow.current = false;
    flushSync(() => setCreating(false));
  };

  return (
    <>
      <AttributeMenuButton insert={insert} state={state} suspended={creating}>
        <AttributeList
          label={ATTRIBUTE_MENU_LABEL}
          onCreate={() => {
            creatingNow.current = true;
            setCreating(true);
          }}
          onSelect={(name) => {
            state.setMenuOpen(false);
            commands.insertInlineValue(name);
          }}
          onClose={() => {
            if (!creatingNow.current) state.close();
          }}
        />
      </AttributeMenuButton>
      <DynamicAttributeDialog
        open={creating}
        onClose={() => {
          closeDialog();
          state.close();
          commands.focus();
        }}
        onCreate={(id) => {
          closeDialog();
          state.setMenuOpen(false);
          commands.focus();
          commands.insertInlineValue(dynamicAttributeName(id));
        }}
      />
    </>
  );
}

/** The list of the Attribute menu, drawn in its popover. */
function AttributeList({
  label,
  onCreate,
  onSelect,
  onClose,
}: Readonly<{
  label: string;
  onCreate: () => void;
  onSelect: (name: string) => void;
  onClose: () => void;
}>) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  return (
    <VariablePickerList
      aria-label={label}
      groups={attributeMenuGroups(intl, environment, onCreate)}
      optionPill={(option) => environment.naming.pillFor(option.value)}
      onSelect={onSelect}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    />
  );
}
