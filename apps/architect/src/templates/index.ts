import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';

import behaviouralInfluence from './behavioural-influence-networks.json';
import careSupport from './care-support-networks.json';
import mentalHealth from './mental-health-networks.json';
import sexualInjectionRisk from './sexual-injection-risk-networks.json';
import socialConnection from './social-connection-isolation.json';
import { loadTemplateAssets } from './template-assets';
import transnational from './transnational-networks.json';

export type BundledTemplate = {
  id: string;
  name: string;
  description: string;
  protocol: CurrentProtocol;
  // Templates that ship media (e.g. a bundled GeoJSON) expose a lazy loader
  // that fetches those assets as Blobs when the template is opened; templates
  // without assets omit it.
  loadAssets?: () => Promise<ExtractedAsset[]>;
};

// Cast once: the transnational protocol is referenced both as the protocol and
// by its asset loader.
const transnationalProtocol = transnational as unknown as CurrentProtocol;

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
      "The important people in a migrant's life, here and abroad, placed on a world map",
    protocol: transnationalProtocol,
    loadAssets: () => loadTemplateAssets(transnationalProtocol),
  },
  {
    id: 'mental-health-networks',
    name: 'Mental Health Networks',
    description:
      'Supportive and difficult relationships, and who knows about your mental health',
    protocol: mentalHealth as unknown as CurrentProtocol,
  },
  {
    id: 'social-connection-isolation',
    name: 'Social Connection & Isolation',
    description:
      'A map of close relationships paired with questionnaires about loneliness',
    protocol: socialConnection as unknown as CurrentProtocol,
  },
  {
    id: 'behavioural-influence-networks',
    name: 'Behavioural Influence Networks',
    description:
      'How your health habits compare with those of the people around you',
    protocol: behaviouralInfluence as unknown as CurrentProtocol,
  },
  {
    id: 'care-support-networks',
    name: 'Care & Support Networks',
    description:
      'Who helps you through a period of care, and the kinds of help they give',
    protocol: careSupport as unknown as CurrentProtocol,
  },
  {
    id: 'sexual-injection-risk-networks',
    name: 'Sexual & Injection Risk Networks',
    description:
      'Sexual and injecting partners and timing, with encrypted partner names',
    protocol: sexualInjectionRisk as unknown as CurrentProtocol,
  },
];
