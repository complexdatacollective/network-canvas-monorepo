import { useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { VariableTypes } from '@codaco/protocol-validation';

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import { sectionIdForCodebookSubject } from '../../codebook/editing.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import type { RowEditorProps } from '../rowRenderers.tsx';
import { geospatialMessages } from './geospatialMessages.ts';

/** The only attribute type that can hold a place on a map. */
const LOCATION = VariableTypes.location;

const subjectOf = (value: unknown): CodebookSubject | null => {
  if (typeof value !== 'object' || value === null) return null;
  const entity = Reflect.get(value, 'entity');
  const type = Reflect.get(value, 'type');
  if (entity === 'ego') return { entity: 'ego' };
  if ((entity !== 'node' && entity !== 'edge') || typeof type !== 'string') {
    return null;
  }
  return entity === 'node'
    ? { entity: 'node', type }
    : { entity: 'edge', type };
};

/**
 * One geospatial prompt: what it asks, and where the answer goes.
 *
 * The attribute is a LOCATION attribute of the stage's own type, because that
 * is the only thing a map selection can be stored in. A researcher who has not
 * created one yet creates it here, through the codebook's own editor and the
 * session's compound-edit path — the same edit the codebook screen would make,
 * so the new attribute is a real part of the protocol rather than something
 * this prompt invented for itself.
 *
 * Rendered inside the prompt dialog, whose form store is its own. The controls
 * are therefore ordinary connected fields, not `ProtocolField`s: registering a
 * row's cells with the stage would let a deleted row's value come back on save.
 */
export default function GeospatialPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const createLabel = intl.formatMessage(
    geospatialMessages.createAttributeLabel,
  );
  const { controller, readOnly } = useStageEditorForm();
  const setRowFieldValue = useFormStore((store) => store.setFieldValue);
  const subject = subjectOf(useStageValue('subject'));
  const [creating, setCreating] = useState<{
    key: string;
    variableId: string;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const protocolContext = controller.snapshot.protocolContext;
  const variables = useMemo(
    () =>
      subject === null ? {} : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );
  const options = useMemo(
    () =>
      Object.entries(variables)
        .filter(([, variable]) => variable.type === LOCATION)
        .map(([value, variable]) => ({
          value,
          label: variable.name,
          type: variable.type,
        }))
        .toSorted((left, right) => left.label.localeCompare(right.label)),
    [variables],
  );

  const authoritativeDocument =
    subject === null
      ? undefined
      : controller.snapshot.protocolSections[
          sectionIdForCodebookSubject(subject)
        ];

  const text = typeof item.text === 'string' ? item.text : undefined;
  const variable =
    typeof item.variable === 'string' ? item.variable : undefined;

  return (
    <>
      <Field
        name="text"
        label={intl.formatMessage(geospatialMessages.promptTextLabel)}
        hint={intl.formatMessage(geospatialMessages.promptTextHint)}
        component={InputField}
        initialValue={text}
        required={intl.formatMessage(geospatialMessages.promptTextRequired)}
      />
      <Field
        name="variable"
        label={intl.formatMessage(geospatialMessages.promptVariableLabel)}
        hint={intl.formatMessage(geospatialMessages.promptVariableHint)}
        component={VariablePickerControl}
        initialValue={variable}
        options={options}
        emptyMessage={intl.formatMessage(
          geospatialMessages.promptVariableEmptyState,
        )}
        required={intl.formatMessage(geospatialMessages.promptVariableRequired)}
      />
      {!readOnly && subject !== null && authoritativeDocument !== undefined && (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setCreating({ key: uuid(), variableId: uuid() })}
        >
          {createLabel}
        </Button>
      )}
      {creating !== null &&
        subject !== null &&
        authoritativeDocument !== undefined && (
          <Dialog
            open
            title={createLabel}
            size="readable"
            closeDialog={() => setCreating(null)}
            finalFocus={() => triggerRef.current}
          >
            <VariableEditor
              mode="create"
              openId={creating.key}
              subject={subject}
              protocolContext={protocolContext}
              authoritativeDocument={authoritativeDocument}
              variableId={creating.variableId}
              initialDraft={{ name: '', type: LOCATION }}
              allowedVariableTypes={[LOCATION]}
              description={intl.formatMessage(
                geospatialMessages.createAttributeDescription,
              )}
              createRequestId={() => uuid()}
              onSubmitRequest={(request) =>
                controller.requestCompoundEdit(request)
              }
              onComplete={(variableId) => {
                // The prompt's own draft, not the stage's: the row is committed
                // when the dialog around it saves.
                setRowFieldValue('variable', variableId);
                setCreating(null);
              }}
            />
          </Dialog>
        )}
    </>
  );
}
