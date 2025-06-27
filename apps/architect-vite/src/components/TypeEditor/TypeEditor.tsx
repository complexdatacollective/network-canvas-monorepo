import { capitalize, toPairs } from "es-toolkit/compat";
import { useEffect, useMemo } from "react";
import { connect, useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Layout, Section } from "~/components/EditorLayout";
import { ValidatedField } from "~/components/Form";
import * as Fields from "~/lib/legacy-ui/components/Fields";
import { getCodebook } from "~/selectors/protocol";
import { getFieldId } from "~/utils/issues";
import ColorPicker from "../Form/Fields/ColorPicker";
import IconOption from "./IconOption";
import getPalette from "./getPalette";

const ICON_OPTIONS = ["add-a-person", "add-a-place"];

type TypeEditorProps = {
	form: string;
	entity: string;
	type?: string | null;
	existingTypes: string[];
};

const TypeEditor = ({ form, entity, type = null, existingTypes }: TypeEditorProps) => {
	const dispatch = useDispatch();
	const formSelector = useMemo(() => formValueSelector(form), [form]);
	const formIcon = useSelector((state) => formSelector(state, "iconVariant"));

	// Provide a default icon
	useEffect(() => {
		if (entity === "node" && !formIcon) {
			dispatch(change(form, "iconVariant", ICON_OPTIONS[0]));
		}
	}, [entity, form, formIcon, dispatch]);

	const { name: paletteName, size: paletteSize } = getPalette(entity);

	return (
		<>
			<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
				<Layout>
					<h2>{type ? `Edit ${entity}` : `Create ${entity}`}</h2>
				</Layout>
			</div>
			<Layout>
				<Section title={`${capitalize(entity)} Type`}>
					<p>
						Name this {entity} type. This name will be used to identify this type in the codebook, and in your data
						exports.
						{entity === "node" && ' Some examples might be "Person", "Place", or "Organization".'}
						{entity === "edge" && ' Some examples might be "Friends" or "Works With".'}
					</p>
					<ValidatedField
						component={Fields.Text}
						name="name"
						placeholder="Enter a name for this entity type..."
						validation={{ required: true, allowedNMToken: `${entity} type name`, uniqueByList: existingTypes }}
					/>
				</Section>
				<Section title="Color" id={getFieldId("color")} summary={<p>Choose a color for this {entity} type.</p>}>
					<ValidatedField
						component={ColorPicker}
						name="color"
						palette={paletteName}
						paletteRange={paletteSize}
						validation={{ required: true }}
					/>
				</Section>
				{entity === "node" && (
					<Section
						title="Icon"
						id={getFieldId("iconVariant")}
						summary={<p>Choose an icon to display on interfaces that create this {entity}.</p>}
					>
						<ValidatedField
							component={Fields.RadioGroup}
							name="iconVariant"
							options={ICON_OPTIONS}
							optionComponent={IconOption}
							validation={{ required: true }}
						/>
					</Section>
				)}
			</Layout>
		</>
	);
};

const mapStateToProps = (state, { type, isNew }) => {
	const codebook = getCodebook(state);

	const getNames = (codebookTypeDefinitions, excludeType) => {
		const names = [];
		toPairs(codebookTypeDefinitions).forEach(([id, definition]) => {
			if (excludeType && id === excludeType) {
				return;
			}
			names.push(definition.name);
		});
		return names;
	};

	const nodes = getNames(codebook.node, !isNew && type);
	const edges = getNames(codebook.edge, !isNew && type);

	const existingTypes = nodes.concat(edges);

	return {
		existingTypes,
	};
};

export { TypeEditor as UnconnectedTypeEditor };

export default connect(mapStateToProps)(TypeEditor);
