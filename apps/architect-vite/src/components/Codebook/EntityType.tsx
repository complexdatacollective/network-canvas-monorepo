import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { Link } from "wouter";
import { actionCreators as dialogActionCreators } from "~/ducks/modules/dialogs";
import { actionCreators as codebookActionCreators } from "~/ducks/modules/protocol/codebook";
import { Button } from "~/lib/legacy-ui/components";
import EntityIcon from "./EntityIcon";
import { getEntityProperties } from "./helpers";
import Tag from "./Tag";
import Variables from "./Variables";

type UsageItem = {
	id: string;
	label: string;
};

type Variable = Record<string, unknown>;

type EntityTypeProps = {
	entity: string;
	type: string;
	name: string;
	color: string;
	usage: UsageItem[];
	inUse?: boolean;
	handleDelete?: () => void;
	handleEdit?: () => void;
	variables?: Variable[];
	onEditEntity?: (entity: string, type?: string) => void;
};

const EntityType = ({
	name,
	color,
	inUse = true,
	usage,
	entity,
	type,
	variables = [],
	handleEdit = () => {},
	handleDelete = () => {},
	onEditEntity,
}: EntityTypeProps) => {
	const stages = usage.map(({ id, label }) => (
		<Link
			href={`/protocol/stage/${id}`}
			key={id}
			className="underline decoration-[color:var(--color-action)] underline-offset-4 px-1"
		>
			{label}
		</Link>
	));

	return (
		<div className="codebook__entity">
			<div className="codebook__entity-detail">
				<div className="codebook__entity-icon">
					<EntityIcon color={color} entity={entity} type={type} />
				</div>
				<div className="codebook__entity-name">
					<h2>{name}</h2>
				</div>
				<div className="codebook__entity-meta">
					{!inUse && <Tag>not in use</Tag>}
					{inUse && (
						<>
							<em>used in:</em> {stages}
						</>
					)}
				</div>
				<div className="codebook__entity-control">
					<Button onClick={handleEdit} color="sea-green">
						Edit entity
					</Button>
					<Button color="neon-coral" onClick={handleDelete}>
						Delete entity
					</Button>
				</div>
			</div>
			{variables.length > 0 && (
				<div className="codebook__entity-variables">
					<h3>Variables:</h3>
					<Variables variables={variables} entity={entity} type={type} />
				</div>
			)}
		</div>
	);
};

type StateProps = {
	entity: string;
	type: string;
};

const mapStateToProps = (state: unknown, { entity, type }: StateProps) => {
	const entityProperties = getEntityProperties(state, { entity, type });

	return entityProperties;
};

type ConnectedProps = {
	openDialog: typeof dialogActionCreators.openDialog;
	deleteType: typeof codebookActionCreators.deleteType;
};

type HandlerProps = ConnectedProps & EntityTypeProps;

const withEntityHandlers = compose(
	connect(null, {
		openDialog: dialogActionCreators.openDialog,
		deleteType: codebookActionCreators.deleteType,
	}),
	withHandlers<HandlerProps, {}>({
		handleEdit:
			({ entity, type, onEditEntity }: HandlerProps) =>
			() => {
				onEditEntity?.(entity, type);
			},
		handleDelete:
			({ deleteType, openDialog, entity, type, name, inUse }: HandlerProps) =>
			() => {
				if (inUse) {
					openDialog({
						type: "Notice",
						title: `Cannot delete ${name} ${entity}`,
						message: (
							<p>
								The {name} {entity} cannot be deleted as it is currently in use.
							</p>
						),
					});

					return;
				}

				openDialog({
					type: "Warning",
					title: `Delete ${name} ${entity}`,
					message: (
						<p>
							Are you sure you want to delete the {name} {entity}? This cannot be undone.
						</p>
					),
					onConfirm: () => deleteType({ entity, type }),
					confirmLabel: `Delete ${name} ${entity}`,
				});
			},
	}),
);

export default compose(connect(mapStateToProps), withEntityHandlers)(EntityType as React.ComponentType<unknown>);
