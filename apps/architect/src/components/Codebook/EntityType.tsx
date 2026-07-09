import { useCallback, useState } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { Link } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
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
        title: `Cannot delete ${name} ${entity}`,
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
      title: `Delete ${name} ${entity}`,
      description: `Are you sure you want to delete the ${name} ${entity}? This cannot be undone.`,
      confirmLabel: `Delete ${name} ${entity}`,
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: () => {
        void dispatch(deleteTypeAsync({ entity, type }));
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
    <Section layout="vertical" required={false}>
      <div className="flex items-center gap-5">
        <div className="flex shrink-0 basis-19 items-center justify-center">
          <EntityIcon
            color={color}
            entity={entity}
            shape={shape}
            size="small"
          />
        </div>
        <Heading level="h2" margin="none">
          {name}
        </Heading>
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
            Add variable
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
