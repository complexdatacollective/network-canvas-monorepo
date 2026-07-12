import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export function CompatibilityNotice() {
  const t = useTranslations('GetStarted');

  return (
    <Alert variant="warning">
      <AlertTitle>{t('compatibility.title')}</AlertTitle>
      <AlertDescription>
        <Paragraph margin="none">{t('compatibility.description')}</Paragraph>
      </AlertDescription>
    </Alert>
  );
}
