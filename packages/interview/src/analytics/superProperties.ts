import { version } from '../../package.json';
import type {
  InterviewAnalyticsMetadata,
  InterviewPayload,
} from '../contract/types';
import { SUPER_PROPS, type SuperProperties } from './PROPERTY_KEYS';

export function computeSuperProperties(
  metadata: InterviewAnalyticsMetadata,
  payload: InterviewPayload,
): SuperProperties {
  const props: SuperProperties = {
    [SUPER_PROPS.APP]: metadata.hostApp,
    [SUPER_PROPS.INSTALLATION_ID]: metadata.installationId,
    [SUPER_PROPS.PACKAGE_VERSION]: version,
    [SUPER_PROPS.PROTOCOL_HASH]: payload.protocol.hash,
  };
  if (metadata.hostVersion !== undefined) {
    props[SUPER_PROPS.HOST_VERSION] = metadata.hostVersion;
  }
  return props;
}
