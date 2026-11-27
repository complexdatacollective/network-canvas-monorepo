import { useCallback, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import { useCreateCodebookEntity } from '../codebook/writes.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { layoutNameRefusal } from './variableNameRules.ts';
import VariablePickerField, {
  type CreateOptionOutcome,
  type PickerWording,
  type VariablePickerOption,
} from './VariablePickerField.tsx';

const wording = defineMessages({
  placeholder: {
    id: 'protocolBuilder.layoutPicker.placeholder',
    defaultMessage: 'Select a layout',
    description:
      'Shown inside the layout control while no layout has been chosen. Pressing the control opens a list of the layouts in the codebook. A layout is a named set of positions that a researcher places nodes in on a canvas.',
  },
  emptyState: {
    id: 'protocolBuilder.layoutPicker.emptyState',
    defaultMessage: 'The codebook has no layouts yet.',
    description:
      'Shown in the layout control when the codebook has no layouts. A layout is a named set of positions that a researcher places nodes in on a canvas.',
  },
  searchPlaceholder: {
    id: 'protocolBuilder.layoutPicker.searchPlaceholder',
    defaultMessage: 'Find or create a layout…',
    description:
      'Placeholder in the search box at the top of the layout list, where a new layout can be created by typing its name.',
  },
  searchOnlyPlaceholder: {
    id: 'protocolBuilder.layoutPicker.searchOnlyPlaceholder',
    defaultMessage: 'Find a layout…',
    description:
      'Placeholder in the search box at the top of the layout list, where only existing layouts can be chosen.',
  },
  noMatches: {
    id: 'protocolBuilder.layoutPicker.noMatches',
    defaultMessage: 'No layouts match “{query}”.',
    description:
      'Shown in the layout list when no layout matches what the researcher typed in the search box. query is what they typed and is not translated.',
  },
  firstAttribute: {
    id: 'protocolBuilder.layoutPicker.firstLayout',
    defaultMessage:
      'The codebook has no layouts yet. Type a name above to create the first one.',
    description:
      'Shown in the layout list when the codebook has no layouts and the researcher may create one by typing its name in the search box above.',
  },
  createRow: {
    id: 'protocolBuilder.layoutPicker.createRow',
    defaultMessage: 'Create “{attributeName}”',
    description:
      'First row of the layout list, offering to add a layout under the name the researcher has typed into the search box. attributeName is what they typed and is not translated.',
  },
  createRowBusy: {
    id: 'protocolBuilder.layoutPicker.createRowBusy',
    defaultMessage: 'Creating “{attributeName}”…',
    description:
      'The first row of the layout list while the layout the researcher asked for is being added to the codebook. attributeName is the name they typed and is not translated.',
  },
  createRowUntyped: {
    id: 'protocolBuilder.layoutPicker.createRowNew',
    defaultMessage: 'New layout',
    description:
      'Second line of the row that creates a layout. A layout is a named set of positions that a researcher places nodes in on a canvas.',
  },
  createRowInvalidName: {
    id: 'protocolBuilder.layoutPicker.createRowInvalidName',
    defaultMessage: 'A layout cannot be named “{attributeName}”',
    description:
      'First row of the layout list, switched off because the name typed into the search box cannot be used. A second line below it gives the reason. attributeName is what the researcher typed and is not translated.',
  },
  missingOptionLabel: {
    id: 'protocolBuilder.layoutPicker.missingOptionLabel',
    defaultMessage: '{attributeId} — this layout is not in the codebook',
    description:
      'Name of the option standing for a stored layout that the codebook no longer has. attributeId is the raw stored identifier.',
  },
  missingAttribute: {
    id: 'protocolBuilder.layoutPicker.missingLayout',
    defaultMessage: 'This layout is not in the codebook. Choose another one.',
    description:
      'Shown under the layout control when the layout that the stored choice names is not in the codebook, for example because it was deleted.',
  },
  createdUnassigned: {
    id: 'protocolBuilder.layoutPicker.createdUnassigned',
    defaultMessage:
      '“{variableName}” was added to the codebook, but it has not been selected here.',
    description:
      'Notice under the layout control, shown when the layout the researcher named was added to the codebook but was not selected here. variableName is the name they typed and is not translated.',
  },
}) satisfies PickerWording;

const SEARCH_NAMES = {
  create: 'Find or create a layout',
  only: 'Find a layout',
};

export type LayoutPickerFieldProps = CreateFormFieldProps<string, 'div'>;

/**
 * Chooses a layout of the codebook by name, or creates one from the name
 * typed in the search box. A layout belongs to the codebook rather than to a
 * node type, so every layout is offered, whatever the stage shows.
 */
export default function LayoutPickerField(props: LayoutPickerFieldProps) {
  const intl = useAppIntl();
  const { codebook } = useProtocolContext();
  const createEntity = useCreateCodebookEntity();
  const { onChange } = props;
  const layouts = useMemo(() => codebook.layouts ?? {}, [codebook.layouts]);
  const nodeTypes = useMemo(() => codebook.node ?? {}, [codebook.node]);

  const options = useMemo<VariablePickerOption[]>(
    () =>
      Object.entries(layouts).map(([value, { name }]) => ({
        value,
        label: name,
      })),
    [layouts],
  );

  const nameRefusal = useCallback(
    (typed: string) => layoutNameRefusal(typed, { layouts, nodeTypes, intl }),
    [intl, layouts, nodeTypes],
  );

  const onCreateOption = useCallback(
    async (name: string): Promise<CreateOptionOutcome> => {
      const outcome = await createEntity('layout', { name });
      if (outcome.status === 'refused') {
        return { status: 'refused', message: outcome.message };
      }
      const ref = parseSectionId(outcome.sectionId);
      if (ref.kind !== 'codebookLayout' || onChange === undefined) {
        return { status: 'unassigned' };
      }
      onChange(ref.layoutId);
      return { status: 'created' };
    },
    [createEntity, onChange],
  );

  return (
    <VariablePickerField
      {...props}
      options={options}
      nameRefusal={nameRefusal}
      onCreateOption={onCreateOption}
      wording={wording}
      searchNames={SEARCH_NAMES}
    />
  );
}
