import { AppErrorMessage } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

const ActionError = ({
  errorTitle,
  errorDescription,
}: {
  errorTitle: string;
  errorDescription: string;
}) => {
  return (
    <Alert variant="destructive">
      <AlertTitle>
        <AppErrorMessage error={errorTitle} />
      </AlertTitle>
      <AlertDescription>
        <AppErrorMessage error={errorDescription} />
      </AlertDescription>
    </Alert>
  );
};

export default ActionError;
