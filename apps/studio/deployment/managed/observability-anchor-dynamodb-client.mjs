export function managedAnchorDynamoClientConfiguration(region) {
  if (typeof region !== 'string' || region.length === 0)
    throw new Error('ANCHOR_RUNTIME_CONFIGURATION_INVALID');
  return Object.freeze({
    region,
    ignoreConfiguredEndpointUrls: true,
  });
}
