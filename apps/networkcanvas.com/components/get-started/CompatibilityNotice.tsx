import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { type compatibilityWarning } from '~/lib/getStarted';

type CompatibilityNoticeProps = {
  notice: typeof compatibilityWarning;
};

export function CompatibilityNotice({ notice }: CompatibilityNoticeProps) {
  return (
    <Alert variant="warning">
      <AlertDescription>
        <p>
          <strong>{notice.title}</strong>
        </p>
        <p>{notice.description}</p>
      </AlertDescription>
    </Alert>
  );
}
