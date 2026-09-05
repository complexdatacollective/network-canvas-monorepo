import { createElement, useCallback, useState } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { Link } from 'wouter';

import { commonMessages } from '@codaco/app-i18n/common';
import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { ColorReference } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import NewVariableWindow from '~/components/NewVariableWindow/NewVariableWindow';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteTypeAsync } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';

import EntityIcon from './EntityIcon';
import { filterEntityType } from './filterEntityType';
import { getEntityProperties } from './helpers';
import Tag from './Tag';
import Variables from './Variables';
const messages = defineMessages({
  cannotDeleteType: {
    id: 'architect.codebook.entityType.cannotDeleteType',
    defaultMessage: 'Cannot delete type',
    description: 'The title text in components / Codebook / EntityType.',
  },
  theCannotBeDeletedAsIt: {
    id: 'architect.codebook.entityType.theCannotBeDeletedAsIt',
    defaultMessage:
      'The {name} {entity, select, node {node} edge {edge} other {ego}} cannot be deleted as it is currently in use.',
    description: 'Visible text in components / Codebook / EntityType.',
  },
  oK: {
    id: 'architect.codebook.entityType.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / Codebook / EntityType.',
  },
  deleteType: {
    id: 'architect.codebook.entityType.deleteType',
    defaultMessage: 'Delete type',
    description: 'The title text in components / Codebook / EntityType.',
  },
  areYouSureYouWantTo: {
    id: 'architect.codebook.entityType.areYouSureYouWantTo',
    defaultMessage:
      'Are you sure you want to delete the {entity, select, node {node} edge {edge} other {ego}} type “{name}”? You can restore it with Undo while this protocol remains open.',
    description: 'The description text in components / Codebook / EntityType.',
  },
  type: {
    id: 'architect.codebook.entityType.type',
    defaultMessage:
      '{name} {entity, select, node {node} edge {edge} other {ego}} type',
    description: 'The title text in components / Codebook / EntityType.',
  },
  notInUse: {
    id: 'architect.codebook.entityType.notInUse',
    defaultMessage: 'not in use',
    description: 'Visible text in components / Codebook / EntityType.',
  },
  usedIn: {
    id: 'architect.codebook.entityType.usedIn',
    defaultMessage: 'used in:',
    description: 'Visible text in components / Codebook / EntityType.',
  },
  editEntity: {
    id: 'architect.codebook.entityType.editEntity',
    defaultMessage: 'Edit entity',
    description: 'Visible text in components / Codebook / EntityType.',
  },
  inUseInStageSRemove: {
    id: 'architect.codebook.entityType.inUseInStageSRemove',
    defaultMessage:
      '{value1, plural, one {In use in # stage — remove usages first} other {In use in # stages — remove usages first}}',
    description: 'The title text in components / Codebook / EntityType.',
  },
  deleteEntity: {
    id: 'architect.codebook.entityType.deleteEntity',
    defaultMessage: 'Delete entity',
    description: 'The title text in components / Codebook / EntityType.',
  },
  addAttribute: {
    id: 'architect.codebook.entityType.addAttribute',
    defaultMessage: 'Add attribute',
    description: 'Visible text in components / Codebook / EntityType.',
  },
});

type Entity = 'node' | 'edge' | 'ego';
type UsageItem = {
  id?: string;
  label: string;
};
type Variable = {
  id: string;
  name: string;
  component: string;
  inUse: boolean;
  usage: UsageItem[];
  usageString?: string;
};
type VariablesComponentProps = {
  variables: Variable[];
  entity: Entity;
  type?: string;
};
// Props expected by the unwrapped component
type EntityTypeProps = {
  entity: Entity;
  type: string;
  name: string;
  color: ColorReference;
  shape?: NodeShape;
  usage: UsageItem[];
  inUse?: boolean;
  search?: string;
  unusedOnly?: boolean;
  onEditEntity?: (entity: string, type?: string) => void;
  variables?: Record<string, Variable>;
};
const EntityType = ({
  name,
  color,
  shape,
  inUse = true,
  usage,
  entity,
  type,
  variables = {},
  search = '',
  unusedOnly = false,
  onEditEntity,
}: EntityTypeProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { confirm, openDialog } = useDialog();
  const [showAddVariable, setShowAddVariable] = useState(false);
  const variableArray = Object.values(variables);
  const VariablesTyped =
    Variables as unknown as React.ComponentType<VariablesComponentProps>;
  // Apply the codebook's "Show unused only" / search filters at the variable
  // level (mirroring EgoType) so a type stays visible when it itself matches
  // or merely contains matching variables.
  const { visible, variables: filteredVariables } = filterEntityType(
    variableArray,
    { name, inUse, search, unusedOnly },
  );
  const handleEdit = useCallback(() => {
    onEditEntity?.(entity, type);
  }, [entity, onEditEntity, type]);
  const handleDelete = useCallback(() => {
    if (inUse) {
      void openDialog({
        type: 'acknowledge',
        intent: 'info',
        title: createElement(AppMessage, {
          message: messages.cannotDeleteType,
        }),
        children: (
          <Paragraph>
            {createElement(AppMessage, {
              message: messages.theCannotBeDeletedAsIt,
              values: {
                name: name,
                entity: entity,
              },
            })}
          </Paragraph>
        ),
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
      return;
    }
    void confirm({
      // Fixed, localisable action strings — see the same change in
      // Codebook/Variables.tsx. A type name interpolated into the heading and
      // the confirm button overflowed the dialog at every width (#1392).
      title: createElement(AppMessage, { message: messages.deleteType }),
      // `codebook/deleteType` is inside the protocol timeline, so Undo restores
      // it (#1400) — wording shared with the stage, variable and resource
      // dialogs.
      description: createElement(AppMessage, {
        message: messages.areYouSureYouWantTo,
        values: {
          entity: entity,
          name: name,
        },
      }),
      confirmLabel: createElement(AppMessage, { message: messages.deleteType }),
      cancelLabel: createElement(AppMessage, {
        message: commonMessages.cancel,
      }),
      intent: 'destructive',
      // `.unwrap()` re-throws a rejected thunk so `confirm` can surface the
      // refusal in the dialog's error paragraph and keep the dialog open.
      // Without it the dispatch promise RESOLVES even when the thunk rejected,
      // and the dialog closes reporting a deletion that never happened — the
      // same defect #1392 fixed on the sibling variable deletion.
      //
      // `ensureError` because `.unwrap()` throws Redux Toolkit's plain
      // `SerializedError`, not an `Error` — and the dialog only shows a caught
      // value's `message` when it `instanceof Error`, so without this the
      // researcher gets "An error occurred" instead of the reason.
      onConfirm: async () => {
        try {
          await dispatch(deleteTypeAsync({ entity, type })).unwrap();
        } catch (error) {
          throw ensureError(error);
        }
      },
    });
  }, [confirm, dispatch, entity, inUse, name, openDialog, type]);
  if (!visible) {
    return null;
  }
  const stages = usage.map(({ id, label }, index) => {
    // If there is no id, don't create a link. This is the case for
    // usages that are only present as validation options. Include the index
    // in the key since validation labels can repeat (e.g. "unknown").
    if (!id) {
      return <Tag key={`validation-${index}-${label}`}>{label}</Tag>;
    }
    return (
      <Link key={id} href={`/protocol/stage/${id}`}>
        <Tag>{label}</Tag>
      </Link>
    );
  });
  return (
    <Section
      title={intl.formatMessage(messages.type, { name: name, entity: entity })}
    >
      <div className="flex items-center gap-5">
        <div className="flex shrink-0 basis-19 items-center justify-center">
          <EntityIcon
            color={color}
            entity={entity}
            shape={shape}
            size="small"
          />
        </div>
        <div className="flex-1">
          {!inUse && <Tag notUsed>{intl.formatMessage(messages.notInUse)}</Tag>}
          {inUse && (
            <div className="flex flex-wrap items-center gap-1">
              <span>{intl.formatMessage(messages.usedIn)}</span>
              {stages}
            </div>
          )}
        </div>
        <Button onClick={handleEdit} color="primary">
          {intl.formatMessage(messages.editEntity)}
        </Button>
        <span
          title={
            inUse
              ? intl.formatMessage(messages.inUseInStageSRemove, {
                  value1: usage.length,
                })
              : intl.formatMessage(messages.deleteEntity)
          }
          className="inline-block"
        >
          <Button color="destructive" onClick={handleDelete} disabled={inUse}>
            {intl.formatMessage(messages.deleteEntity)}
          </Button>
        </span>
      </div>
      <div className="mt-5">
        <div className="flex justify-end">
          <Button
            color="primary"
            size="sm"
            onClick={() => setShowAddVariable(true)}
          >
            {intl.formatMessage(messages.addAttribute)}
          </Button>
        </div>
        {filteredVariables.length > 0 && (
          <VariablesTyped
            variables={filteredVariables}
            entity={entity}
            type={type}
          />
        )}
      </div>
      <NewVariableWindow
        show={showAddVariable}
        entity={entity}
        type={type}
        onComplete={() => setShowAddVariable(false)}
        onCancel={() => setShowAddVariable(false)}
      />
    </Section>
  );
};
type StateProps = {
  entity: Entity;
  type: string;
};
const mapStateToProps = (
  state: RootState,
  { entity, type, intl }: StateProps & { intl: IntlShape },
) => {
  const entityProperties = getEntityProperties(state, { entity, type }, intl);
  return entityProperties;
};
// OwnProps - props that must be passed from outside
type OwnProps = StateProps & {
  inUse?: boolean;
  usage: UsageItem[];
  search?: string;
  unusedOnly?: boolean;
  onEditEntity?: (entity: string, type?: string) => void;
};
const ConnectedEntityType = compose<
  EntityTypeProps,
  OwnProps & { intl: IntlShape }
>(connect(mapStateToProps))(EntityType);

export default function LocalizedEntityType(props: OwnProps) {
  const intl = useAppIntl();
  return <ConnectedEntityType {...props} intl={intl} />;
}
