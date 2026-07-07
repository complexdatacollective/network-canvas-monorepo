import { useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';
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

// `enrolmentCommitted` is wizard state that can drift from the vault: a
// same-method "Change" that revokes the old vault and then fails to re-enrol
// (e.g. the user cancels the OS biometric sheet) leaves the flag true while the
// vault holds no matching mode. Reconcile against the real `authApi.status()`
// before presenting a read-only "configured" summary — otherwise Finish would
// complete claiming a mode the vault lacks, with the previous data already
// destroyed by the revoke. If they disagree, clear the stale flag and drop back
// into the configure form so Next actually re-enrols.
function ReadOnlySummary({
  method,
  onChange,
}: {
  method: WizardSelectedMethod;
  onChange: () => void;
}) {
  const wizard = useWizard();
  const [reconciled, setReconciled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authApi.status().then((status) => {
      if (cancelled) return;
      if (status.configured && status.mode === method) {
        setReconciled(true);
        return;
      }
      // The vault does not hold the selected mode — the committed enrolment is
      // stale. Force re-enrolment rather than finishing on a phantom mode.
      wizard.setStepData({ enrolmentCommitted: false });
      onChange();
    });
    return () => {
      cancelled = true;
    };
  }, [method, wizard, onChange]);

  useEffect(() => {
    if (!reconciled) {
      wizard.setNextEnabled(false);
      wizard.setBeforeNext(null);
      return;
    }
    wizard.setNextEnabled(true);
    wizard.setBeforeNext(null);
  }, [wizard, reconciled]);

  if (!reconciled) return null;

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
