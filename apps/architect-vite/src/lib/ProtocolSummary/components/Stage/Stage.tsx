import { get, isEmpty, sortBy } from "es-toolkit/compat";
import React, { useContext } from "react";
import interfaceImage from "~/images/timeline";
import DualLink from "../DualLink";
import EntityBadge from "../EntityBadge";
import MiniTable from "../MiniTable";
import SummaryContext from "../SummaryContext";
import Behaviours from "./Behaviours";
import DataSource from "./DataSource";
import Filter from "./Filter";
import Form from "./Form";
import InterviewScript from "./InterviewScript";
import IntroductionPanel from "./IntroductionPanel";
import Items from "./Items";
import PageHeading from "./PageHeading";
import Panels from "./Panels";
import Presets from "./Presets";
import Prompts from "./Prompts";
import QuickAdd from "./QuickAdd";
import SkipLogic from "./SkipLogic";

const getInterfaceImage = (type: string) => get(interfaceImage, type);

const variablesOnStage = (index: Array<{ id: string; name: string; stages: string[] }>) => (stageId: string) =>
	index.reduce<Array<[string, string]>>((memo, variable) => {
		if (!variable.stages.includes(stageId)) {
			return memo;
		}
		memo.push([variable.id, variable.name]);
		return memo;
	}, []);

type StageProps = {
	configuration: Record<string, unknown>;
	id: string;
	label: string;
	stageNumber: number;
	type: string;
};

const Stage = ({ configuration, id, label, stageNumber, type }: StageProps) => {
	const { index } = useContext(SummaryContext);

	const stageVariables = sortBy(variablesOnStage(index)(id), [(variable) => variable[1].toLowerCase()]);

	const subject = configuration.subject as { type: string; entity: string } | undefined;
	const filter = configuration.filter as Record<string, unknown> | undefined;
	const skipLogic = configuration.skipLogic as Record<string, unknown> | undefined;
	const introductionPanel = configuration.introductionPanel as { title: string; text: string } | undefined;
	const dataSource = configuration.dataSource as string | undefined;
	const quickAdd = configuration.quickAdd as string | undefined;
	const panels = configuration.panels as { id: string; title: string; dataSource: string }[] | undefined;
	const prompts = configuration.prompts as unknown[] | undefined;
	const form = configuration.form as { title?: string; fields?: unknown[] } | undefined;
	const behaviours = configuration.behaviours as Record<string, unknown> | undefined;
	const presets = configuration.presets as
		| {
				label: string;
				layoutVariable?: string;
				groupVariable?: string;
				edges?: { display?: string[] };
				highlight?: string[];
		  }[]
		| undefined;
	const title = configuration.title as string | undefined;
	const items = configuration.items as { id?: string; type?: string; content?: string; size?: string }[] | undefined;
	const interviewScript = configuration.interviewScript as string | undefined;

	return (
		<div className="protocol-summary-stage page-break-marker" id={`stage-${id}`}>
			<div className="protocol-summary-stage__heading">
				<div className="protocol-summary-stage__wrapper">
					<div className="protocol-summary-stage__summary">
						<div className="stage-label" data-number={stageNumber}>
							<h1>{label}</h1>
						</div>
						{subject && !isEmpty(stageVariables) && (
							<table className="protocol-summary-mini-table protocol-summary-mini-table--rotated">
								<tbody>
									{subject && (
										<tr>
											<td>Subject</td>
											<td>
												<EntityBadge small type={subject.type} entity={subject.entity} link />
											</td>
										</tr>
									)}
									{!isEmpty(stageVariables) && (
										<tr>
											<td>Variables</td>
											<td>
												{stageVariables.map(([variableId, variable], i) => (
													<React.Fragment key={`${id}-${variableId}`}>
														<DualLink to={`#variable-${variableId}`}>{variable}</DualLink>
														{i !== stageVariables.length - 1 && ", "}
													</React.Fragment>
												))}
											</td>
										</tr>
									)}
								</tbody>
							</table>
						)}
					</div>
					<div className="protocol-summary-stage__preview">
						<div className="stage-image">
							<img src={getInterfaceImage(type)} alt="" />
						</div>
						{/* <h4>
              {type}
            </h4> */}
					</div>
				</div>
				{filter && (
					<div className="protocol-summary-stage__heading-section">
						<div className="protocol-summary-stage__heading-section-content">
							<h2 className="section-heading">Network Filtering</h2>
							<MiniTable rotated wide rows={[["Rules", <Filter filter={filter} />]]} />
						</div>
					</div>
				)}
				{skipLogic && (
					<div className="protocol-summary-stage__heading-section">
						<div className="protocol-summary-stage__heading-section-content">
							<h2 className="section-heading">Skip Logic</h2>
							<SkipLogic skipLogic={skipLogic} />
						</div>
					</div>
				)}
				<div className="protocol-summary-stage__content">
					<IntroductionPanel introductionPanel={introductionPanel ?? null} />
					<DataSource dataSource={dataSource ?? null} />
					<QuickAdd quickAdd={quickAdd ?? null} />
					<Panels panels={panels ?? null} />
					<Prompts prompts={prompts ?? null} />
					<Form form={form ?? null} />
					<Behaviours behaviours={behaviours ?? null} />
					<Presets presets={presets ?? null} />
					<PageHeading heading={title ?? null} />
					<Items items={items ?? null} />
					<InterviewScript interviewScript={interviewScript ?? null} />
				</div>
			</div>
		</div>
	);
};

export default Stage;
