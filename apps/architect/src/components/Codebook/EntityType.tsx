import { useCallback, useState } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { Link } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
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
  color: string;
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
        title: 'Cannot delete type',
        children: (
          <Paragraph>
            The {name} {entity} cannot be deleted as it is currently in use.
          </Paragraph>
        ),
        actions: { primary: { label: 'OK', value: true } },
      });
      return;
    }
    void confirm({
      // Fixed, localisable action strings — see the same change in
      // Codebook/Variables.tsx. A type name interpolated into the heading and
      // the confirm button overflowed the dialog at every width (#1392).
      title: 'Delete type',
      // `codebook/deleteType` is inside the protocol timeline, so Undo restores
      // it (#1400) — wording shared with the stage, variable and resource
      // dialogs.
      description: `Are you sure you want to delete the ${entity} type “${name}”? You can restore it with Undo while this protocol remains open.`,
      confirmLabel: 'Delete type',
      cancelLabel: 'Cancel',
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
    <Section title={`${name} ${entity} type`}>
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
          {!inUse && <Tag notUsed>not in use</Tag>}
          {inUse && (
            <div className="flex flex-wrap items-center gap-1">
              <span>used in:</span>
              {stages}
            </div>
          )}
        </div>
        <Button onClick={handleEdit} color="primary">
          Edit entity
        </Button>
        <span
          title={
            inUse
              ? `In use in ${usage.length} stage(s) — remove usages first`
              : 'Delete entity'
          }
          className="inline-block"
        >
          <Button color="destructive" onClick={handleDelete} disabled={inUse}>
            Delete entity
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
            Add attribute
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
const mapStateToProps = (state: RootState, { entity, type }: StateProps) => {
  const entityProperties = getEntityProperties(state, { entity, type });
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
export default compose<EntityTypeProps, OwnProps>(connect(mapStateToProps))(
  EntityType,
);
