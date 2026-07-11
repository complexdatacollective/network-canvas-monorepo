import { protocolMigrations } from '@codaco/protocol-validation';

const canUpgrade = (from, to) => protocolMigrations.canMigrate(from, to);

export default canUpgrade;
