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
// canonical, validated source for each template lives at the repo root in
// `/templates/<id>/protocol.json`. The copies imported here are generated from
// those sources by `scripts/sync-templates.mjs` and bundled into the app so a
// template opens without a network fetch; `__tests__/bundled-sync.test.ts` fails
// CI if a copy drifts from its canonical source.
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
