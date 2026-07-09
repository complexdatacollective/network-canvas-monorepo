import { omit } from 'es-toolkit/compat';
import type { ComponentType } from 'react';
import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { Section } from '~/components/EditorLayout';
import { CheckboxGroup } from '~/components/Form/Fields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/modules/root';
import type { AppDispatch } from '~/ducks/store';
import { getNodeTypes } from '~/selectors/codebook';

import { updateVariableByUUID } from '../../../ducks/modules/protocol/codebook';
import DetachedField from '../../DetachedField';

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
  const dispatch = useDispatch<AppDispatch>();
  const { confirm } = useDialog();
  const nodeTypes = useSelector(
    (state: RootState) => getNodeTypes(state) as Record<string, NodeType>,
  );

  const handleEncryptionToggle = useCallback(
    (variableId: string, encrypted: boolean, variable: Variable) => {
      const properties = encrypted
        ? { ...variable, encrypted: true }
        : omit(variable, 'encrypted');

      void dispatch(updateVariableByUUID(variableId, properties, false));
    },
    [dispatch],
  );

  const handleToggleChange = useCallback(
    async (
      hasEncryptedVariable: boolean,
      nodeType: NodeType,
      newState: boolean,
    ) => {
      if (!hasEncryptedVariable || newState) {
        return true;
      }

      const confirmed = await confirm({
        title: 'This will clear selected variables',
        description: `This will deselect all encrypted variables for the ${nodeType.name} node type. Do you want to continue?`,
        confirmLabel: 'Clear encrypted variables',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });

      if (confirmed) {
        Object.entries(nodeType.variables || {}).forEach(
          ([variableId, variable]) => {
            if (variable?.encrypted) {
              handleEncryptionToggle(variableId, false, variable);
            }
          },
        );
        return true;
      }

      return false;
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
      title="Encrypted Variables"
      summary={
        <>
          <p>
            You may encrypt one or more text variables. Select the text
            variables for each node type that should be encrypted.
          </p>
          <Alert variant="info" className="my-7">
            <AlertDescription>
              <p>
                Values for encrypted variables are not stored in the database.
              </p>
            </AlertDescription>
          </Alert>
        </>
      }
    >
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
            startExpanded={hasEncryptedVariable}
            layout="vertical"
            handleToggleChange={(newState) =>
              handleToggleChange(hasEncryptedVariable, nodeType, newState)
            }
            summary={<p>Which variables should be encrypted?</p>}
          >
            <div className="max-h-75 overflow-y-auto">
              <DetachedField
                component={
                  CheckboxGroup as ComponentType<Record<string, unknown>>
                }
                options={variableOptions}
                value={encryptedVariableIds}
                onChange={(_event: unknown, nextValue: unknown) => {
                  const nextValueArray = nextValue as string[];
                  Object.entries(variables).forEach(
                    ([variableId, variable]) => {
                      const shouldEncrypt = nextValueArray.includes(variableId);
                      if (variable?.encrypted !== shouldEncrypt) {
                        handleEncryptionToggle(
                          variableId,
                          shouldEncrypt,
                          variable,
                        );
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
