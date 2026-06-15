import type { CurrentProtocol } from '@codaco/protocol-validation';

import behaviouralInfluence from './behavioural-influence-networks.json';
import careSupport from './care-support-networks.json';
import mentalHealth from './mental-health-networks.json';
import sexualInjectionRisk from './sexual-injection-risk-networks.json';
import socialConnection from './social-connection-isolation.json';
import transnational from './transnational-networks.json';

export type BundledTemplate = {
  id: string;
  name: string;
  description: string;
  protocol: CurrentProtocol;
};

// Research-grounded starting points shown in Architect's "Templates" tab. The
// canonical, validated sources live at the repo root in
// `/templates/<id>/protocol.json`; the copies imported here are bundled into the
// app so a template can be opened without a network fetch. Keep the two in sync.
export const BUNDLED_TEMPLATES: BundledTemplate[] = [
  {
    id: 'transnational-networks',
    name: 'Transnational Networks',
    description:
      'Migrant integration: host vs origin-country ties, mapped on a world map',
    protocol: transnational as unknown as CurrentProtocol,
  },
  {
    id: 'mental-health-networks',
    name: 'Mental Health Networks',
    description: 'Supportive and difficult ties, disclosure, and help-seeking',
    protocol: mentalHealth as unknown as CurrentProtocol,
  },
  {
    id: 'social-connection-isolation',
    name: 'Social Connection & Isolation',
    description: 'Network structure paired with validated loneliness scales',
    protocol: socialConnection as unknown as CurrentProtocol,
  },
  {
    id: 'behavioural-influence-networks',
    name: 'Behavioural Influence Networks',
    description: 'Health-behaviour homophily across multiplex ties',
    protocol: behaviouralInfluence as unknown as CurrentProtocol,
  },
  {
    id: 'care-support-networks',
    name: 'Care & Support Networks',
    description: 'Functional support across formal and informal sources',
    protocol: careSupport as unknown as CurrentProtocol,
  },
  {
    id: 'sexual-injection-risk-networks',
    name: 'Sexual & Injection Risk Networks',
    description: 'Partnership timing and risk for HIV / STI transmission',
    protocol: sexualInjectionRisk as unknown as CurrentProtocol,
  },
];
