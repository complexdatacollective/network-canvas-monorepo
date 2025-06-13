import Markdown from "@codaco/legacy-ui/components/Fields/Markdown";

type InterviewScriptProps = {
	interviewScript?: string | null;
};

const InterviewScript = ({ interviewScript = null }: InterviewScriptProps) => (
	<div className="protocol-summary-stage__interview-script">
		<div className="protocol-summary-stage__interview-script-content">
			<h2 className="section-heading">Interviewer Script</h2>
			{interviewScript && <Markdown label={interviewScript} />}
		</div>
	</div>
);

export default InterviewScript;
