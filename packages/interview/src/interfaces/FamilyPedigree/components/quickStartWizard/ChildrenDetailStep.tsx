'use client';

import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { inferGameteProviders } from '../../utils/inferGameteProviders';
import BioTriadStep, {
  BioTriadConfigProvider,
} from '../wizards/steps/BioTriadStep';
import { readBiologicalSex } from '../wizards/transforms/personAttributes';
import PersonFields from './PersonFields';

export default function ChildrenDetailStep() {
  const values = useFormValue([
    'childrenWithPartnerCount',
    'partner.name',
    'partner.biologicalSex',
    'biologicalSex',
  ]);
  const childrenWithPartnerCount = values.childrenWithPartnerCount;
  const count = Number(childrenWithPartnerCount ?? 0);
  const partnerNameValue = values['partner.name'];
  const partnerName =
    typeof partnerNameValue === 'string' && partnerNameValue.length > 0
      ? partnerNameValue
      : 'Your partner';

  if (count === 0) return null;

  const egoSex = readBiologicalSex(values.biologicalSex);
  const partnerSex = readBiologicalSex(values['partner.biologicalSex']);

  // Use known binary values only to choose convenient initial selections. Both
  // people remain eligible for both gamete roles; sex recorded at birth and
  // reproductive role are captured independently.
  const preselection = inferGameteProviders(
    { value: 'ego', sex: egoSex },
    { value: 'partner', sex: partnerSex },
    {
      eggSource: 'ego',
      spermSource: 'partner',
      eggParentCarried: true,
    },
  );

  const existingNodes = [
    {
      value: 'ego',
      label: 'You',
    },
    {
      value: 'partner',
      label: partnerName,
    },
  ];

  const bioTriadConfig = {
    existingNodes,
    preselection,
  };

  return (
    <BioTriadConfigProvider value={bioTriadConfig}>
      <Paragraph>
        Please tell us about each of your children with your current partner,
        and confirm who their biological parents are.
      </Paragraph>
      <div className="flex flex-col gap-6">
        {Array.from({ length: count }, (_, i) => (
          <Surface key={i} spacing="sm" shadow="sm">
            <Heading level="h3">Child {i + 1}</Heading>
            <PersonFields namespace={`childWithPartner[${String(i)}]`} />
            <BioTriadStep prefix={`childWithPartner[${String(i)}].parentage`} />
          </Surface>
        ))}
      </div>
    </BioTriadConfigProvider>
  );
}
