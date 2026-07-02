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
  const { childrenWithPartnerCount, partner, biologicalSex } = useFormValue([
    'childrenWithPartnerCount',
    'partner',
    'biologicalSex',
  ]);
  const count = Number(childrenWithPartnerCount ?? 0);
  const partnerObj = partner as
    | { name?: string; biologicalSex?: unknown }
    | undefined;
  const partnerName = partnerObj?.name || 'Your partner';

  if (count === 0) return null;

  // Pre-select who provided each gamete from ego's and the partner's biological
  // sex; fall back to the positional default (you → egg, partner → sperm) when
  // it cannot be inferred.
  const preselection = inferGameteProviders(
    { value: 'ego', sex: readBiologicalSex(biologicalSex) },
    { value: 'partner', sex: readBiologicalSex(partnerObj?.biologicalSex) },
    {
      eggSource: 'ego',
      spermSource: 'partner',
      carrier: 'egg-source',
      eggParentCarried: true,
    },
  );

  const bioTriadConfig = {
    existingNodes: [
      { value: 'ego', label: 'You' },
      { value: 'partner', label: partnerName },
    ],
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
