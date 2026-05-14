import Markdown from "~/components/Form/Fields/Markdown";
import SectionFrame from "./SectionFrame";

type InterviewScriptProps = {
	interviewScript?: string | null;
};

const InterviewScript = ({ interviewScript = null }: InterviewScriptProps) => (
	<SectionFrame title="Interviewer Script" wrapperClassName="break-inside-avoid" contentClassName="min-h-[25rem]">
		{interviewScript && <Markdown label={interviewScript} />}
	</SectionFrame>
);

export default InterviewScript;
