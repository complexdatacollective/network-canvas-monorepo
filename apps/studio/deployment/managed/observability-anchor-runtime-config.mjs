const SHA256 = /^[a-f0-9]{64}$/;
const TABLE = /^[A-Za-z0-9_.-]{3,255}$/;
const REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;

export function readManagedAnchorStoreEnvironment(env) {
  const value = Object.freeze({
    accountIdentitySha256: env.STUDIO_ANCHOR_ACCOUNT_IDENTITY_SHA256,
    tableName: env.STUDIO_ANCHOR_TABLE_NAME,
    region: env.AWS_REGION,
  });
  if (
    !SHA256.test(value.accountIdentitySha256 ?? '') ||
    !TABLE.test(value.tableName ?? '') ||
    !REGION.test(value.region ?? '')
  )
    throw new Error('ANCHOR_RUNTIME_CONFIGURATION_INVALID');
  return value;
}

export function readManagedAnchorEnvironment(env) {
  const store = readManagedAnchorStoreEnvironment(env);
  const value = {
    ...store,
    forwarderToken: env.STUDIO_ANCHOR_FORWARDER_TOKEN,
    operatorToken: env.STUDIO_ANCHOR_OPERATOR_TOKEN,
    authorityKeyId: env.STUDIO_ANCHOR_MONTH_AUTHORITY_KEY_ID,
    authorityPublicKey: env.STUDIO_ANCHOR_MONTH_AUTHORITY_PUBLIC_KEY,
  };
  if (
    !TOKEN.test(value.forwarderToken ?? '') ||
    !TOKEN.test(value.operatorToken ?? '') ||
    value.forwarderToken === value.operatorToken ||
    !KEY_ID.test(value.authorityKeyId ?? '') ||
    !PUBLIC_KEY.test(value.authorityPublicKey ?? '')
  )
    throw new Error('ANCHOR_RUNTIME_CONFIGURATION_INVALID');
  return Object.freeze(value);
}
