import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

const WorkInProgress = () => {
  const t = useTranslations('WorkInProgress');
  return (
    <Alert variant="success" appearance="soft" icon={Clock}>
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{t('content')}</AlertDescription>
    </Alert>
  );
};

export default WorkInProgress;
