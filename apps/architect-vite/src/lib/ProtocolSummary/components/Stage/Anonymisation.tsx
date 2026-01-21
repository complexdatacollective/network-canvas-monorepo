import { useContext } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import DualLink from "../DualLink";
import EntityBadge from "../EntityBadge";
import { renderValue } from "../helpers";
import MiniTable from "../MiniTable";
import SummaryContext from "../SummaryContext";

type AnonymisationProps = {
	explanationText?: {
		title: string;
		body: string;
	} | null;
	validation?: {
		minLength?: number;
		maxLength?: number;
	} | null;
};

type EncryptedVariable = {
	id: string;
	name: string;
	nodeType: string;
	nodeTypeName: string;
};

const getEncryptedVariables = (codebook: {
	node?: Record<
		string,
		{
			name: string;
			variables?: Record<string, { name: string; encrypted?: boolean }>;
		}
	>;
}): EncryptedVariable[] => {
	const encrypted: EncryptedVariable[] = [];

	if (!codebook?.node) {
		return encrypted;
	}

	for (const [nodeTypeId, nodeType] of Object.entries(codebook.node)) {
		if (!nodeType.variables) continue;

		for (const [variableId, variable] of Object.entries(nodeType.variables)) {
			if (variable.encrypted) {
				encrypted.push({
					id: variableId,
					name: variable.name,
					nodeType: nodeTypeId,
					nodeTypeName: nodeType.name,
				});
			}
		}
	}

	return encrypted;
};

const validationRows = (validation: { minLength?: number; maxLength?: number }) => {
	const rows: [string, React.ReactNode][] = [];

	if (validation.minLength !== undefined) {
		rows.push(["Minimum passphrase length", renderValue(validation.minLength)]);
	}

	if (validation.maxLength !== undefined) {
		rows.push(["Maximum passphrase length", renderValue(validation.maxLength)]);
	}

	return rows;
};

const Anonymisation = ({ explanationText = null, validation = null }: AnonymisationProps) => {
	const { protocol } = useContext(SummaryContext);
	const encryptedVariables = getEncryptedVariables(protocol.codebook);

	const hasExplanation = !!explanationText;
	const hasValidation = validation && (validation.minLength !== undefined || validation.maxLength !== undefined);
	const hasEncryptedVariables = encryptedVariables.length > 0;

	if (!hasExplanation && !hasValidation && !hasEncryptedVariables) {
		return null;
	}

	return (
		<>
			{hasExplanation && (
				<div className="protocol-summary-stage__explanation-text">
					<div className="protocol-summary-stage__explanation-text-content">
						<h3>{explanationText.title}</h3>
						<Markdown label={explanationText.body} />
					</div>
				</div>
			)}

			{hasValidation && (
				<div className="protocol-summary-stage__passphrase-validation">
					<div className="protocol-summary-stage__passphrase-validation-content">
						<MiniTable rotated rows={validationRows(validation)} />
					</div>
				</div>
			)}

			{hasEncryptedVariables && (
				<div className="protocol-summary-stage__encrypted-variables">
					<div className="protocol-summary-stage__encrypted-variables-content">
						<p className="mb-4">The following variables will be encrypted using the participant's passphrase:</p>
						<table className="protocol-summary-mini-table">
							<thead>
								<tr>
									<th>Node Type</th>
									<th>Variable</th>
								</tr>
							</thead>
							<tbody>
								{encryptedVariables.map(({ id, name, nodeType }) => (
									<tr key={id}>
										<td>
											<EntityBadge small type={nodeType} entity="node" link />
										</td>
										<td>
											<DualLink to={`#variable-${id}`}>{name}</DualLink>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</>
	);
};

export default Anonymisation;
