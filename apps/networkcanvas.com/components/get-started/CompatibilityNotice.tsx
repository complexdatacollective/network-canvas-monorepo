import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { type compatibilityWarning } from '~/lib/getStarted';

type CompatibilityNoticeProps = {
  notice: typeof compatibilityWarning;
};

export function CompatibilityNotice({ notice }: CompatibilityNoticeProps) {
  return (
    <Alert variant="warning">
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>
        <Paragraph margin="none">{notice.description}</Paragraph>
      </AlertDescription>
    </Alert>
  );
}
