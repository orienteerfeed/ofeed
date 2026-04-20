import config from '@/config';

const LOCALIZED_DOCS_LANGUAGES = new Set(['cs']);

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

function normalizeLanguageCode(language: string | undefined): string | null {
  const trimmed = language?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return trimmed.split(/[-_]/)[0] ?? null;
}

export function buildLocalizedDocsUrl(
  language: string | undefined,
  options: {
    baseUrl?: string;
    defaultLanguage?: string;
    localizedLanguages?: Iterable<string>;
  } = {},
): string {
  const baseUrl = options.baseUrl ?? config.DOCS_URL;
  const normalizedLanguage = normalizeLanguageCode(language);
  const normalizedDefaultLanguage =
    normalizeLanguageCode(options.defaultLanguage ?? config.DEFAULT_LANGUAGE) ??
    'en';
  const localizedLanguages = new Set(
    Array.from(options.localizedLanguages ?? LOCALIZED_DOCS_LANGUAGES).flatMap(
      languageCode => normalizeLanguageCode(languageCode) ?? [],
    ),
  );

  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    return baseUrl;
  }

  const pathnameSegments = url.pathname.split('/').filter(Boolean);

  if (
    normalizedLanguage !== null &&
    normalizedLanguage !== normalizedDefaultLanguage &&
    localizedLanguages.has(normalizedLanguage) &&
    pathnameSegments.at(-1) !== normalizedLanguage
  ) {
    pathnameSegments.push(normalizedLanguage);
  }

  url.pathname =
    pathnameSegments.length > 0 ? `/${pathnameSegments.join('/')}/` : '/';

  return url.toString();
}

export function buildBoardEventUrl(
  eventId: string | null | undefined
): string | null {
  const normalizedEventId = eventId?.trim();
  if (!normalizedEventId) {
    return null;
  }

  try {
    return new URL(
      `/events/ofeed/${encodeURIComponent(normalizedEventId)}`,
      config.BOARD_APP_URL
    ).toString();
  } catch {
    return null;
  }
}

export const externalLinks = {
  mrb: (baseApi: string) => `${baseApi}/mrb`,
  docs: config.DOCS_URL,
  buyMeCoffee: 'https://buymeacoffee.com/ofeed',
  discord: 'https://discord.gg/YWURC23tHZ',
  github: 'https://github.com/orienteerfeed/ofeed',
} as const;
