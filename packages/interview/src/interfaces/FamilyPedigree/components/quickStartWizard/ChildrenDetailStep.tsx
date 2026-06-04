'use client';

import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import BioTriadStep, {
  BioTriadConfigProvider,
} from '../wizards/steps/BioTriadStep';
import PersonFields from './PersonFields';

export default function ChildrenDetailStep() {
  const { childrenWithPartnerCount, partner } = useFormValue([
    'childrenWithPartnerCount',
    'partner',
  ]);
  const count = Number(childrenWithPartnerCount ?? 0);
  const partnerName =
    (partner as { name?: string } | undefined)?.name || 'Your partner';

  if (count === 0) return null;

  const bioTriadConfig = {
    existingNodes: [
      { value: 'ego', label: 'You' },
      { value: 'partner', label: partnerName },
    ],
    preselection: {
      eggSource: 'ego',
      spermSource: 'partner',
      carrier: 'egg-source',
    },
  };

  return (
    <BioTriadConfigProvider value={bioTriadConfig}>
      <Paragraph>
        Please tell us about each of your children with your current partner,
        and confirm who their biological parents are.
      </Paragraph>
      <div className="flex flex-col gap-6">
        {Array.from({ length: count }, (_, i) => (
          <Surface key={i} level={1} spacing="sm" shadow="sm">
            <Heading level="h3">Child {i + 1}</Heading>
            <PersonFields namespace={`childWithPartner[${String(i)}]`} />
            <BioTriadStep prefix={`childWithPartner[${String(i)}].parentage`} />
          </Surface>
        ))}
      </div>
    </BioTriadConfigProvider>
  );
}
