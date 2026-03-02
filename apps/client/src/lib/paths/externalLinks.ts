import config from '@/config';

export const externalEventSystems = {
  ORIS: {
    label: 'ORIS',
    eventBaseUrl: 'https://oris.ceskyorientak.cz/Zavod?id=',
  },
  EVENTOR: {
    label: 'Eventor',
    eventBaseUrl: 'https://eventor.orienteering.sport/Events/Show/',
  },
} as const;

export type ExternalEventSystemProvider = keyof typeof externalEventSystems;

export function buildExternalEventUrl(
  provider: ExternalEventSystemProvider | undefined,
  externalEventId: string | null | undefined
): string | null {
  const normalizedExternalEventId = externalEventId?.trim();
  if (!normalizedExternalEventId) {
    return null;
  }

  const resolvedProvider = provider ?? 'ORIS';
  const baseUrl = externalEventSystems[resolvedProvider].eventBaseUrl;

  return `${baseUrl}${encodeURIComponent(normalizedExternalEventId)}`;
}

export const externalLinks = {
  mrb: (baseApi: string) => `${baseApi}/mrb`,
  docs: config.DOCS_URL,
  buyMeCoffee: config.BUY_ME_A_COFFEE_URL,
  discord: config.DISCORD_INVITE_URL,
  github: config.GITHUB_REPO_URL,
  weblate: config.WEBLATE_URL,
} as const;
