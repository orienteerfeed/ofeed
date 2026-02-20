import { Input, Select } from '@/components/atoms';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TFunction } from 'i18next';
import { Loader2, Search, Unplug } from 'lucide-react';
import React from 'react';
import { useApi } from '../../../hooks';
import { useRequest } from '../../../hooks/useRequest';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { EventFormData } from '../../../types';
import { toast } from '../../../utils/toast';

type ExternalProvider = 'ORIS' | 'EVENTOR';

type ExternalEventSearchItem = {
  provider: ExternalProvider;
  externalEventId: string;
  name: string;
  date?: string;
  location?: string;
};

type ExternalEventSearchResponse = {
  data?: ExternalEventSearchItem[];
};

interface EventExternalLinkCardProps {
  t: TFunction;
  eventId: string;
  initialData?: Partial<EventFormData> | null;
  onUpdated?: () => void | Promise<void>;
}

export const EventExternalLinkCard: React.FC<EventExternalLinkCardProps> = ({
  t,
  eventId,
  initialData = null,
  onUpdated,
}) => {
  const { post } = useApi();
  const request = useRequest();
  const apiPostRef = React.useRef(post);

  const [externalProvider, setExternalProvider] =
    React.useState<ExternalProvider>('ORIS');
  const [externalEventId, setExternalEventId] = React.useState('');
  const [externalApiKey, setExternalApiKey] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<
    ExternalEventSearchItem[]
  >([]);
  const [showSearchResults, setShowSearchResults] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUnlinkRequested, setIsUnlinkRequested] = React.useState(false);
  const latestSearchIdRef = React.useRef(0);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const persistedExternalSource = initialData?.externalSource ?? null;
  const persistedExternalEventId = (initialData?.externalEventId ?? '').trim();
  const currentExternalEventId = isUnlinkRequested ? '' : externalEventId.trim();
  const currentExternalSource = currentExternalEventId
    ? externalProvider
    : null;
  const hasCurrentLink = Boolean(currentExternalSource && currentExternalEventId);
  const hasPersistedLink = Boolean(
    persistedExternalSource && persistedExternalEventId
  );
  const hasLinkChange =
    currentExternalSource !== persistedExternalSource ||
    currentExternalEventId !== persistedExternalEventId;
  const isEventorProvider = externalProvider === 'EVENTOR';

  const clearSearchTimeout = React.useCallback(() => {
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    apiPostRef.current = post;
  }, [post]);

  React.useEffect(() => {
    const nextSource = (initialData?.externalSource as ExternalProvider | null) ?? 'ORIS';
    const nextEventId = initialData?.externalEventId ?? '';

    setExternalProvider(nextSource);
    setExternalEventId(nextEventId);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setIsSearching(false);
    setIsUnlinkRequested(false);
    clearSearchTimeout();
  }, [clearSearchTimeout, initialData?.externalEventId, initialData?.externalSource]);

  React.useEffect(() => {
    return () => {
      clearSearchTimeout();
    };
  }, [clearSearchTimeout]);

  const runSearch = React.useCallback(
    async (rawQuery: string, source: 'auto' | 'manual' = 'auto') => {
      const query = rawQuery.trim();

      if (query.length < 2) {
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }

      if (isEventorProvider && !externalApiKey.trim()) {
        setSearchResults([]);
        setShowSearchResults(false);
        if (source === 'manual') {
          toast({
            title: t('Operations.Error', { ns: 'common' }),
            description: t(
              'Pages.Event.Form.Import.Toast.EventorApiKeyRequired',
              'Eventor API key is required for Eventor provider.'
            ),
            variant: 'error',
          });
        }
        return;
      }

      const searchId = latestSearchIdRef.current + 1;
      latestSearchIdRef.current = searchId;
      setIsSearching(true);

      try {
        const payload = await apiPostRef.current<ExternalEventSearchResponse>(
          ENDPOINTS.searchExternalEvents(),
          {
            provider: externalProvider,
            query,
            apiKey: isEventorProvider ? externalApiKey.trim() || undefined : undefined,
            limit: 8,
          }
        );

        if (latestSearchIdRef.current !== searchId) {
          return;
        }

        setSearchResults(payload?.data ?? []);
        setShowSearchResults(true);
      } catch (error) {
        if (latestSearchIdRef.current !== searchId) {
          return;
        }

        setSearchResults([]);
        setShowSearchResults(false);

        if (source === 'manual') {
          toast({
            title: t('Pages.Event.Form.Import.Toast.SearchFailedTitle', {
              defaultValue: 'Search failed',
            }),
            description:
              error instanceof Error
                ? error.message
                : t(
                    'Pages.Event.Form.Import.Toast.SearchFailedDescription',
                    'Unable to search events in external provider.'
                  ),
            variant: 'error',
          });
        }
      } finally {
        if (latestSearchIdRef.current === searchId) {
          setIsSearching(false);
        }
      }
    },
    [externalApiKey, externalProvider, isEventorProvider, t]
  );

  const scheduleSearch = React.useCallback(
    (rawQuery: string) => {
      clearSearchTimeout();

      const query = rawQuery.trim();
      if (query.length < 2) {
        setSearchResults([]);
        setShowSearchResults(false);
        setIsSearching(false);
        return;
      }

      searchTimeoutRef.current = setTimeout(() => {
        void runSearch(query, 'auto');
      }, 350);
    },
    [clearSearchTimeout, runSearch]
  );

  React.useEffect(() => {
    if (!showSearchResults) return;
    const query = searchQuery.trim();
    if (query.length < 2) return;

    scheduleSearch(query);
  }, [
    externalApiKey,
    externalProvider,
    scheduleSearch,
    searchQuery,
    showSearchResults,
  ]);

  const handleSearchResultSelect = (item: ExternalEventSearchItem) => {
    clearSearchTimeout();
    latestSearchIdRef.current += 1;
    setIsSearching(false);
    setExternalProvider(item.provider);
    setExternalEventId(item.externalEventId);
    setSearchQuery(item.name);
    setShowSearchResults(false);
    setIsUnlinkRequested(false);
  };

  const handleUnlinkRequest = () => {
    setIsUnlinkRequested(true);
    setExternalEventId('');
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    toast({
      title: t('Operations.Success', { ns: 'common' }),
      description: t(
        'Pages.Event.Form.Import.Toast.LinkRemovedPendingSave',
        'External event link will be removed after saving the event.'
      ),
    });
  };

  const handleSaveExternalLink = async () => {
    if (!initialData) return;

    const {
      name,
      sportId,
      date,
      timezone,
      organizer,
      location,
      latitude,
      longitude,
      countryCode,
      zeroTime,
      ranking,
      coefRanking,
      relay,
      published,
      hundredthPrecision,
    } = initialData;

    if (
      !name ||
      !sportId ||
      !date ||
      !timezone ||
      !organizer ||
      !location ||
      !zeroTime
    ) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Event.Form.Import.Toast.InvalidResponse',
          'Unable to process imported event data.'
        ),
        variant: 'error',
      });
      return;
    }

    if (!isUnlinkRequested && !currentExternalEventId) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Event.Form.Import.Toast.ExternalIdRequired',
          'External event ID is required.'
        ),
        variant: 'error',
      });
      return;
    }

    setIsSaving(true);

    try {
      await request.request(ENDPOINTS.eventDetail(eventId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sportId,
          date,
          timezone,
          organizer,
          location,
          latitude,
          longitude,
          countryCode,
          zeroTime,
          ranking: ranking ?? false,
          coefRanking,
          relay: relay ?? false,
          published: published ?? false,
          hundredthPrecision: hundredthPrecision ?? false,
          externalSource: isUnlinkRequested ? null : currentExternalSource,
          externalEventId: isUnlinkRequested ? null : currentExternalEventId,
        }),
        onSuccess: () => {
          toast({
            title: t('Operations.Success', { ns: 'common' }),
            description: isUnlinkRequested
              ? t(
                  'Pages.Event.Form.Import.Toast.LinkRemoved',
                  'External event link removed successfully.'
                )
              : t(
                  'Pages.Event.Form.Import.Toast.LinkSaved',
                  'External event link saved successfully.'
                ),
            variant: 'default',
          });
        },
        onError: err => {
          toast({
            title: t('Operations.Error', { ns: 'common' }),
            description:
              typeof err === 'object' &&
              err !== null &&
              'message' in err &&
              typeof (err as { message?: unknown }).message === 'string'
                ? (err as { message: string }).message
                : t('Errors.Generic', 'Something went wrong'),
            variant: 'error',
          });
        },
      });

      setIsUnlinkRequested(false);
      if (onUpdated) {
        await onUpdated();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-4 space-y-2">
        <CardTitle className="text-xl font-bold tracking-tight">
          {t('Pages.Event.Form.Import.Title', 'Import from external IS')}
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed text-muted-foreground">
          {t(
            'Pages.Event.Form.Import.Description',
            'Search event by name or load by external event ID and prefill this form.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-2 space-y-4">
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {hasCurrentLink ? (
              <>
                {t('Pages.Event.Form.Import.CurrentLink', 'Current link')}:{' '}
                <span className="font-medium text-foreground">
                  {`${currentExternalSource} • ${currentExternalEventId}`}
                </span>
              </>
            ) : (
              t(
                'Pages.Event.Form.Import.NoLink',
                'This event is not linked to any external system.'
              )
            )}
          </p>
          {(hasCurrentLink || hasPersistedLink) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleUnlinkRequest}
              disabled={isSaving}
            >
              <Unplug className="mr-2 h-4 w-4" />
              {t('Pages.Event.Form.Import.Unlink', 'Remove link')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Select
              value={externalProvider}
              onValueChange={value => {
                setExternalProvider(value as ExternalProvider);
                setIsUnlinkRequested(false);
              }}
              options={[
                {
                  value: 'ORIS',
                  label: t('Pages.Event.Form.Import.Providers.ORIS', 'ORIS'),
                },
                {
                  value: 'EVENTOR',
                  label: t('Pages.Event.Form.Import.Providers.EVENTOR', 'Eventor'),
                },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Input
              value={externalEventId}
              onChange={e => {
                setExternalEventId(e.target.value);
                setIsUnlinkRequested(false);
              }}
              placeholder={t(
                'Pages.Event.Form.Import.Placeholders.ExternalEventId',
                'e.g. 8300'
              )}
            />
          </div>
        </div>

        {isEventorProvider && (
          <div className="space-y-2">
            <Input
              value={externalApiKey}
              onChange={e => setExternalApiKey(e.target.value)}
              type="password"
              placeholder={t(
                'Pages.Event.Form.Import.Placeholders.ApiKey',
                'Enter Eventor API key'
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Pages.Event.Form.Import.ApiKeyHelper',
                'API key is required for Eventor import and search.'
              )}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => {
                  const query = e.target.value;
                  setSearchQuery(query);
                  setShowSearchResults(true);
                  scheduleSearch(query);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runSearch(searchQuery, 'manual');
                  }
                }}
                placeholder={t(
                  'Pages.Event.Form.Import.Placeholders.SearchByName',
                  'Type at least 2 characters...'
                )}
                className="pl-9"
                disabled={isSaving || (isEventorProvider && !externalApiKey.trim())}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={
                isSaving ||
                isSearching ||
                searchQuery.trim().length < 2 ||
                (isEventorProvider && !externalApiKey.trim())
              }
              onClick={() => void runSearch(searchQuery, 'manual')}
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {showSearchResults && (isSearching || searchResults.length > 0) ? (
            <div className="space-y-2 rounded-md border border-border bg-background p-2">
              {isSearching ? (
                <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('Pages.Event.Form.Import.Searching', 'Searching...')}
                </div>
              ) : (
                searchResults.map(item => (
                  <button
                    key={`${item.provider}-${item.externalEventId}`}
                    type="button"
                    onClick={() => handleSearchResultSelect(item)}
                    className="w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/50"
                  >
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {`${item.externalEventId}${item.date ? ` • ${item.date}` : ''}${item.location ? ` • ${item.location}` : ''}`}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSaveExternalLink}
            disabled={
              isSaving ||
              !hasLinkChange ||
              (!isUnlinkRequested && currentExternalEventId.length === 0)
            }
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('Pages.Event.Form.Import.SaveLink', 'Save link')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
