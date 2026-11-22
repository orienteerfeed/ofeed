import env from '../../config/env.js';

export type BrokerProfile = (typeof env.YAROC_BROKER_PROFILES)[string];

/** Profiles are validated once at startup by the env schema. */
export function brokerProfiles(): Record<string, BrokerProfile> {
  return {
    default: { url: 'broker.emqx.io', port: 1883, keepAliveSecs: 15 },
    ...env.YAROC_BROKER_PROFILES,
  };
}
