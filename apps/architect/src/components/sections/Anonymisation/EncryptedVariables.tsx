import { createElement, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import Section from '@codaco/fresco-ui/Section';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/modules/root';
import type { AppDispatch } from '~/ducks/store';
import { getNodeTypes } from '~/selectors/codebook';

import { updateVariableByUUID } from '../../../ducks/modules/protocol/codebook';
const messages = defineMessages({
  thisWillClearSelectedAttributes: {
    id: 'architect.sections.anonymisation.encryptedVariables.thisWillClearSelectedAttributes',
    defaultMessage: 'This will clear selected attributes',
    description:
      'The title text in components / sections / Anonymisation / EncryptedVariables.',
  },
  thisWillDeselectAllEncryptedAttributes: {
    id: 'architect.sections.anonymisation.encryptedVariables.thisWillDeselectAllEncryptedAttributes',
    defaultMessage:
      'This will deselect all encrypted attributes for the {value1} node type. Do you want to continue?',
    description:
      'The description text in components / sections / Anonymisation / EncryptedVariables.',
  },
  clearEncryptedAttributes: {
    id: 'architect.sections.anonymisation.encryptedVariables.clearEncryptedAttributes',
    defaultMessage: 'Clear encrypted attributes',
    description:
      'The confirmLabel text in components / sections / Anonymisation / EncryptedVariables.',
  },
  encryptedAttributes: {
    id: 'architect.sections.anonymisation.encryptedVariables.encryptedAttributes',
    defaultMessage: 'Encrypted attributes',
    description:
      'The title text in components / sections / Anonymisation / EncryptedVariables.',
  },
  selectTheTextAttributesForEach: {
    id: 'architect.sections.anonymisation.encryptedVariables.selectTheTextAttributesForEach',
    defaultMessage:
      'Select the text attributes for each node type that should be encrypted.',
    description:
      'The description text in components / sections / Anonymisation / EncryptedVariables.',
  },
  valuesForEncryptedAttributesAreNot: {
    id: 'architect.sections.anonymisation.encryptedVariables.valuesForEncryptedAttributesAreNot',
    defaultMessage:
      'Values for encrypted attributes are not stored in the database.',
    description:
      'Visible text in components / sections / Anonymisation / EncryptedVariables.',
  },
  enableEncryptionForAttributesBelongingTo: {
    id: 'architect.sections.anonymisation.encryptedVariables.enableEncryptionForAttributesBelongingTo',
    defaultMessage:
      'Enable encryption for attributes belonging to this node type.',
    description:
      'The description text in components / sections / Anonymisation / EncryptedVariables.',
  },
});

type Variable = {
  name: string;
  type?: string;
  encrypted?: boolean;
  [key: string]: unknown;
};
type NodeType = {
  name: string;
  variables?: Record<string, Variable>;
  [key: string]: unknown;
};

type EncryptionSectionChange = {
  hasEncryptedVariable: boolean;
  nextOpen: boolean;
  confirmClear: () => Promise<boolean | null>;
  clearSelections: () => void;
};

/**
 * Encrypted attributes live in the Redux codebook rather than a Fresco form,
 * so Section's descendant-field reset cannot clear them on close.
 */
export const requestEncryptionSectionChange = async ({
  hasEncryptedVariable,
  nextOpen,
  confirmClear,
  clearSelections,
}: EncryptionSectionChange): Promise<boolean> => {
  if (!hasEncryptedVariable || nextOpen) {
    return true;
  }

  const confirmed = (await confirmClear()) === true;
  if (!confirmed) {
    return false;
  }

  clearSelections();
  return true;
};

/**
 * Encryption only supports text variables: the interview's secure-attribute
 * path encrypts string values only, so a non-text variable flagged encrypted
 * would be silently stored as plaintext. Restrict the picker to text variables.
 */
export const getEncryptableVariableOptions = (
  variables: Record<string, Variable>,
) =>
  Object.entries(variables)
    .filter(([, variable]) => variable.type === 'text')
    .map(([variableId, variable]) => ({
      value: variableId,
      label: variable.name,
    }));
const EncryptedVariables = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const dispatch = useDispatch<AppDispatch>();
  const { confirm } = useDialog();
  const nodeTypes = useSelector(
    (state: RootState) => getNodeTypes(state) as Record<string, NodeType>,
  );
  const handleEncryptionToggle = useCallback(
    (variableId: string, encrypted: boolean) => {
      void dispatch(
        updateVariableByUUID(variableId, encrypted ? { encrypted: true } : {}, [
          'encrypted',
        ]),
      );
    },
    [dispatch],
  );
  const handleToggleChange = useCallback(
    async (
      hasEncryptedVariable: boolean,
      nodeType: NodeType,
      newState: boolean,
    ) => {
      return requestEncryptionSectionChange({
        hasEncryptedVariable,
        nextOpen: newState,
        confirmClear: () =>
          confirm({
            title: createElement(AppMessage, {
              message: messages.thisWillClearSelectedAttributes,
            }),
            description: createElement(AppMessage, {
              message: messages.thisWillDeselectAllEncryptedAttributes,
              values: { value1: nodeType.name },
            }),
            confirmLabel: createElement(AppMessage, {
              message: messages.clearEncryptedAttributes,
            }),
            cancelLabel: createElement(AppMessage, {
              message: commonMessages.cancel,
            }),
            intent: 'warning',
            onConfirm: () => {},
          }),
        clearSelections: () => {
          Object.entries(nodeType.variables || {}).forEach(
            ([variableId, variable]) => {
              if (variable?.encrypted) {
                handleEncryptionToggle(variableId, false);
              }
            },
          );
        },
      });
    },
    [confirm, handleEncryptionToggle],
  );
  const nodeTypeVariableData = useMemo(
    () =>
      Object.entries(nodeTypes).map(([nodeTypeId, nodeType]) => {
        const variables = nodeType.variables || {};
        const hasEncryptedVariable = Object.values(variables).some(
          (variable) => variable?.encrypted,
        );
        const variableOptions = getEncryptableVariableOptions(variables);
        const encryptedVariableIds = Object.entries(variables)
          .filter(
            ([, variable]) => variable.type === 'text' && variable.encrypted,
          )
          .map(([variableId]) => variableId);
        return {
          nodeTypeId,
          nodeType,
          variables,
          hasEncryptedVariable,
          variableOptions,
          encryptedVariableIds,
        };
      }),
    [nodeTypes],
  );
  return (
    <Section
      title={intl.formatMessage(messages.encryptedAttributes)}
      description={intl.formatMessage(messages.selectTheTextAttributesForEach)}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          {intl.formatMessage(messages.valuesForEncryptedAttributesAreNot)}
        </AlertDescription>
      </Alert>
      {nodeTypeVariableData.map(
        ({
          nodeTypeId,
          nodeType,
          variables,
          hasEncryptedVariable,
          variableOptions,
          encryptedVariableIds,
        }) => (
          <Section
            toggleable
            title={nodeType.name}
            key={nodeTypeId}
            defaultOpen={hasEncryptedVariable}
            description={intl.formatMessage(
              messages.enableEncryptionForAttributesBelongingTo,
            )}
            onOpenChange={(newState) =>
              handleToggleChange(hasEncryptedVariable, nodeType, newState)
            }
          >
            <div className="max-h-75 overflow-y-auto">
              <CheckboxGroupField
                name={`${nodeTypeId}-encrypted-variables`}
                options={variableOptions}
                value={encryptedVariableIds}
                onChange={(nextValue) => {
                  const nextValueArray = nextValue as string[];
                  Object.entries(variables).forEach(
                    ([variableId, variable]) => {
                      const shouldEncrypt = nextValueArray.includes(variableId);
                      if (variable?.encrypted !== shouldEncrypt) {
                        handleEncryptionToggle(variableId, shouldEncrypt);
                      }
                    },
                  );
                }}
              />
            </div>
          </Section>
        ),
      )}
    </Section>
  );
};
export default EncryptedVariables;
