import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/Alert";

const ActionError = ({
	errorTitle,
	errorDescription,
}: {
	errorTitle: string;
	errorDescription: string;
}) => {
	return (
		<Alert variant="destructive" className="bg-white">
			<AlertCircle className="h-4 w-4" />
			<AlertTitle>{errorTitle} </AlertTitle>
			<AlertDescription>{errorDescription}</AlertDescription>
		</Alert>
	);
};

export default ActionError;
