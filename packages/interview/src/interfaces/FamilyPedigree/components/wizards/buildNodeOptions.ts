import type { IntlShape } from '@codaco/app-i18n/messages';
import type { FramingId } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../../../i18n/resolveIntl';
import { messages } from '../../messages';
import { getNodeLabel } from '../../pedigree-layout/utils/getDisplayLabel';
import type { VariableConfig } from '../../store';
import type { BioTriadOption } from './steps/bioTriadOptions';

/** Wizard candidate options: ego as "You", others via the relationship labeller,
 *  filtered to the supplied candidate id set. */
export function buildNodeOptions(
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  candidateIds: Set<string>,
  framing: FramingId,
  intl?: IntlShape,
): BioTriadOption[] {
  const formatter = resolveInterviewIntl(intl);
  const options: BioTriadOption[] = [];
  for (const [id, node] of nodes) {
    if (!candidateIds.has(id)) continue;
    if (node[entityAttributesProperty][variableConfig.egoVariable] === true) {
      options.push({
        value: id,
        label: formatter.formatMessage(messages.you),
        getLabel: (currentIntl) => currentIntl.formatMessage(messages.you),
      });
      continue;
    }
    options.push({
      value: id,
      label: getNodeLabel(id, nodes, edges, variableConfig, framing, formatter),
      getLabel: (currentIntl) =>
        getNodeLabel(id, nodes, edges, variableConfig, framing, currentIntl),
    });
  }
  return options;
}
