import { useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { WizardSelectedMethod } from '~/components/SetupWizardDialog';

import Step3BiometricConfigure from './Step3BiometricConfigure';
import Step3PassphraseConfigure from './Step3PassphraseConfigure';
import Step3PinConfigure from './Step3PinConfigure';

const WIZARD_METHODS: WizardSelectedMethod[] = [
  'biometric',
  'pin',
  'passphrase',
];

function asSelectedMethod(v: unknown): WizardSelectedMethod | null {
  if (typeof v === 'string' && WIZARD_METHODS.some((m) => m === v)) {
    return v as WizardSelectedMethod;
  }
  return null;
}

export default function Step3Configure() {
  const wizard = useWizard();
  const method = asSelectedMethod(wizard.data.selectedMethod);
  const enrolmentCommitted = Boolean(wizard.data.enrolmentCommitted);
  const [editing, setEditing] = useState(!enrolmentCommitted);

  if (!method) return null;

  if (enrolmentCommitted && !editing) {
    return (
      <ReadOnlySummary method={method} onChange={() => setEditing(true)} />
    );
  }

  switch (method) {
    case 'biometric':
      return <Step3BiometricConfigure />;
    case 'pin':
      return <Step3PinConfigure />;
    case 'passphrase':
      return <Step3PassphraseConfigure />;
  }
}

function ReadOnlySummary({
  method,
  onChange,
}: {
  method: WizardSelectedMethod;
  onChange: () => void;
}) {
  const wizard = useWizard();

  useEffect(() => {
    wizard.setNextEnabled(true);
    wizard.setBeforeNext(null);
  }, [wizard]);

  const label =
    method === 'biometric'
      ? 'Biometric configured.'
      : method === 'pin'
        ? 'PIN configured.'
        : 'Passphrase configured.';

  return (
    <>
      <Paragraph>{label}</Paragraph>
      <Button type="button" color="primary" onClick={onChange}>
        Change
      </Button>
    </>
  );
}
