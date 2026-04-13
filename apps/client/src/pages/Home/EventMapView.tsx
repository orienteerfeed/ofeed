import { config } from '@/config';
import {
  createProxiedMapyProvider,
  MAP_TILE_SESSION_URL,
  USE_SAME_ORIGIN_MAP_TILE_ACCESS,
} from '@/lib/maps/mapy';
import { PATHNAMES } from '@/lib/paths/pathnames';
import {
  resolveSupportedMapTileLang,
  type SupportedMapTileMapset,
} from '@repo/shared';
import { useNavigate } from '@tanstack/react-router';
import i18n, { type TFunction } from 'i18next';
import * as Leaflet from 'leaflet';
import { divIcon, marker } from 'leaflet';
import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LeafletMap,
  loadLeafletMarkerCluster,
  MapTileLayer,
  markerPresets,
  useLeafletMap,
} from 'react-mapy';
import './EventMapView.css';
import type { HomeEventListItem } from './types';

interface EventMapViewProps {
  events: HomeEventListItem[];
  t: TFunction;
}

interface MapPoint {
  lat: number;
  lng: number;
}

interface MappableEvent {
  id: string;
  name: string;
  date: string;
  featuredImage?: string;
  latitude: number;
  location: string;
  longitude: number;
}

type EventMarkerColorScheme = 'dark' | 'light';
type OfeedMarkerPreset = (typeof markerPresets)['ofeed'] & {
  assetSrcByColorScheme?: Partial<Record<EventMarkerColorScheme, string>>;
};

const DEFAULT_CENTER = { lat: 49.8175, lng: 15.473 };
const DEFAULT_ZOOM = 7;
const DETAIL_ZOOM = 13;
const MAX_BOUNDS_ZOOM = 17;
const MAP_VARIANT: SupportedMapTileMapset = 'outdoor';
const OFEED_MARKER_PRESET = markerPresets.ofeed as OfeedMarkerPreset;
const MARKER_SIZE = OFEED_MARKER_PRESET.size;
const CLUSTER_DISABLE_AT_ZOOM = 18;

type MarkerClusterGroupInstance = Leaflet.Layer & {
  addLayer(layer: Leaflet.Layer): MarkerClusterGroupInstance;
  addTo(map: Leaflet.Map): MarkerClusterGroupInstance;
  clearLayers(): MarkerClusterGroupInstance;
  remove(): MarkerClusterGroupInstance;
};

interface MarkerClusterFactoryOptions {
  chunkedLoading?: boolean;
  disableClusteringAtZoom?: number;
  iconCreateFunction?: (cluster: {
    getChildCount(): number;
  }) => Leaflet.DivIcon;
  maxClusterRadius?: number | ((zoom: number) => number);
  showCoverageOnHover?: boolean;
}

type LeafletMarkerClusterNamespace = typeof Leaflet & {
  markerClusterGroup?: (
    options?: MarkerClusterFactoryOptions
  ) => MarkerClusterGroupInstance;
};

type LeafletMarkerClusterRuntime = typeof globalThis & {
  L?: LeafletMarkerClusterNamespace;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const normalizeTileLanguage = (value: string | undefined): string => {
  return resolveSupportedMapTileLang(value) ?? 'en';
};

const hasValidCoordinate = (
  value: unknown,
  min: number,
  max: number
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const toMappableEvent = (event: HomeEventListItem): MappableEvent | null => {
  if (
    !hasValidCoordinate(event.latitude, -90, 90) ||
    !hasValidCoordinate(event.longitude, -180, 180)
  ) {
    return null;
  }

  return {
    id: event.id,
    name: event.name,
    date: event.date,
    location: event.location || '',
    ...(event.featuredImage ? { featuredImage: event.featuredImage } : {}),
    latitude: event.latitude,
    longitude: event.longitude,
  };
};

const resolveFeaturedImageUrl = (featuredImage?: string): string | null => {
  if (!featuredImage) {
    return null;
  }

  if (featuredImage.startsWith('/')) {
    return `${config.BASE_API_URL.replace(/\/+$/, '')}${featuredImage}`;
  }

  return featuredImage;
};

const buildEventTooltipHtml = (event: MappableEvent): string => {
  const imageUrl = resolveFeaturedImageUrl(event.featuredImage);
  const imageMarkup = imageUrl
    ? `<img alt="${escapeHtml(event.name)}" class="event-map-tooltip-card__image" loading="lazy" src="${escapeHtml(imageUrl)}" />`
    : '';

  return `
    <div class="event-map-tooltip-card">
      ${imageMarkup}
      <div class="event-map-tooltip-card__body">
        <div class="event-map-tooltip-card__title">${escapeHtml(event.name)}</div>
        <div class="event-map-tooltip-card__meta">${escapeHtml(event.date)}</div>
        <div class="event-map-tooltip-card__meta">${escapeHtml(event.location)}</div>
      </div>
    </div>
  `.trim();
};

const resolveMarkerSize = (zoom: number): readonly [number, number] => {
  const [baseWidth, baseHeight] = MARKER_SIZE;

  if (zoom >= 12) {
    return [baseWidth, baseHeight] as const;
  }

  if (zoom >= 10) {
    return [
      Math.round(baseWidth * 0.88),
      Math.round(baseHeight * 0.88),
    ] as const;
  }

  if (zoom >= 8) {
    return [
      Math.round(baseWidth * 0.76),
      Math.round(baseHeight * 0.76),
    ] as const;
  }

  return [Math.round(baseWidth * 0.64), Math.round(baseHeight * 0.64)] as const;
};

const buildOfeedMarkerIcon = (
  colorScheme: EventMarkerColorScheme,
  zoom: number
) => {
  const assetSrc =
    OFEED_MARKER_PRESET.assetSrcByColorScheme?.[colorScheme] ??
    OFEED_MARKER_PRESET.assetSrc;

  if (!assetSrc) {
    return undefined;
  }

  const [width, height] = resolveMarkerSize(zoom);
  const iconHtml = `
    <div class="react-mapy-marker-icon__inner" style="align-items:center;display:flex;height:100%;justify-content:center;width:100%">
      <img
        alt=""
        class="react-mapy-marker-icon__asset"
        draggable="false"
        height="${height}"
        src="${escapeHtml(assetSrc)}"
        style="display:block;height:100%;width:100%;"
        width="${width}"
      />
    </div>
  `.trim();

  return divIcon({
    className: ['react-mapy-marker-icon', OFEED_MARKER_PRESET.className]
      .filter(Boolean)
      .join(' '),
    html: iconHtml,
    iconAnchor: [Math.round(width / 2), height],
    iconSize: [width, height],
  });
};

const buildClusterIcon = (
  count: number,
  zoom: number,
  colorScheme: EventMarkerColorScheme
) => {
  const tierClassName =
    count >= 25
      ? 'event-map-cluster-icon--large'
      : count >= 10
        ? 'event-map-cluster-icon--medium'
        : 'event-map-cluster-icon--small';

  const zoomClassName =
    zoom >= 12
      ? 'event-map-cluster-icon--zoomed'
      : 'event-map-cluster-icon--far';

  return divIcon({
    className: 'event-map-cluster-icon-wrapper',
    html: `
      <div class="event-map-cluster-icon ${tierClassName} ${zoomClassName} event-map-cluster-icon--${colorScheme}">
        <span>${count}</span>
      </div>
    `.trim(),
    iconAnchor: [22, 22],
    iconSize: [44, 44],
  });
};

function useMapZoom() {
  const map = useLeafletMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const handleZoomEnd = () => {
      setZoom(map.getZoom());
    };

    map.on('zoomend', handleZoomEnd);

    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, [map]);

  return zoom;
}

function FitMapToEvents({ points }: { points: readonly MapPoint[] }) {
  const map = useLeafletMap();
  const hasHandledInitialPointsRef = useRef(false);

  useEffect(() => {
    if (points.length < 2) {
      return;
    }

    if (!hasHandledInitialPointsRef.current) {
      hasHandledInitialPointsRef.current = true;
      return;
    }

    map.fitBounds(
      points.map(({ lat, lng }) => [lat, lng] as [number, number]),
      {
        animate: false,
        maxZoom: MAX_BOUNDS_ZOOM,
        padding: [32, 32],
      }
    );
  }, [map, points]);

  return null;
}

function InitializeMapViewport({
  onReady,
  points,
}: {
  onReady: () => void;
  points: readonly MapPoint[];
}) {
  const map = useLeafletMap();

  useLayoutEffect(() => {
    if (points.length > 1) {
      map.fitBounds(
        points.map(({ lat, lng }) => [lat, lng] as [number, number]),
        {
          animate: false,
          maxZoom: MAX_BOUNDS_ZOOM,
          padding: [32, 32],
        }
      );
    }

    onReady();
  }, [map, onReady, points]);

  return null;
}

function EventMarkersLayer({
  clusteringEnabled,
  events,
  markerColorScheme,
}: {
  clusteringEnabled: boolean;
  events: readonly MappableEvent[];
  markerColorScheme: EventMarkerColorScheme;
}) {
  const map = useLeafletMap();
  const navigate = useNavigate();
  const zoom = useMapZoom();

  useEffect(() => {
    const markerIcon = buildOfeedMarkerIcon(markerColorScheme, zoom);
    const markerLayers = events.map(event => {
      const markerLayer = marker(
        [event.latitude, event.longitude],
        markerIcon
          ? {
              icon: markerIcon,
              riseOnHover: true,
            }
          : {
              riseOnHover: true,
            }
      );

      markerLayer.bindTooltip(buildEventTooltipHtml(event), {
        className: 'event-map-tooltip',
        direction: 'top',
        offset: [0, -16],
        opacity: 1,
      });

      markerLayer.on('click', () => {
        const eventPath = PATHNAMES.eventDetail(event.id);
        navigate({ params: eventPath.params, to: eventPath.to });
      });

      return markerLayer;
    });

    const shouldCluster = clusteringEnabled && events.length > 1;

    if (shouldCluster) {
      const markerClusterFactory = (globalThis as LeafletMarkerClusterRuntime).L
        ?.markerClusterGroup;

      if (!markerClusterFactory) {
        markerLayers.forEach(layer => {
          layer.addTo(map);
        });

        return () => {
          markerLayers.forEach(layer => {
            layer.remove();
          });
        };
      }

      const clusterGroup = markerClusterFactory({
        chunkedLoading: true,
        disableClusteringAtZoom: CLUSTER_DISABLE_AT_ZOOM,
        iconCreateFunction: cluster =>
          buildClusterIcon(cluster.getChildCount(), zoom, markerColorScheme),
        maxClusterRadius: currentZoom => (currentZoom >= 12 ? 36 : 52),
        showCoverageOnHover: false,
      });

      markerLayers.forEach(layer => {
        clusterGroup.addLayer(layer);
      });

      clusterGroup.addTo(map);

      return () => {
        clusterGroup.clearLayers();
        clusterGroup.remove();
      };
    }

    markerLayers.forEach(layer => {
      layer.addTo(map);
    });

    return () => {
      markerLayers.forEach(layer => {
        layer.remove();
      });
    };
  }, [clusteringEnabled, events, map, markerColorScheme, navigate, zoom]);

  return null;
}

export const EventMapView = ({ events, t }: EventMapViewProps) => {
  const { resolvedTheme } = useTheme();
  const tileLanguage = normalizeTileLanguage(
    i18n.resolvedLanguage ?? i18n.language
  );
  const mapTheme = resolvedTheme === 'dark' ? 'dark' : 'neutral';
  const markerColorScheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  const mapEvents = useMemo(
    () =>
      events
        .map(toMappableEvent)
        .filter((event): event is MappableEvent => event !== null),
    [events]
  );

  const boundsPoints = useMemo(
    () =>
      mapEvents.map(({ latitude, longitude }) => ({
        lat: latitude,
        lng: longitude,
      })),
    [mapEvents]
  );

  const provider = useMemo(
    () =>
      createProxiedMapyProvider({
        language: tileLanguage,
        variant: MAP_VARIANT,
      }),
    [tileLanguage]
  );

  const singleEvent = mapEvents.length === 1 ? mapEvents[0] : null;
  const mapCenter = singleEvent
    ? {
        lat: singleEvent.latitude,
        lng: singleEvent.longitude,
      }
    : DEFAULT_CENTER;
  const mapZoom = singleEvent ? DETAIL_ZOOM : DEFAULT_ZOOM;
  const mapInstanceKey = `${tileLanguage}:${mapTheme}`;
  const shouldDelayTileLayer = boundsPoints.length > 1;
  const [isTileLayerReady, setIsTileLayerReady] =
    useState(!shouldDelayTileLayer);
  const [tileAccessStatus, setTileAccessStatus] = useState<
    'loading' | 'ready' | 'error'
  >(USE_SAME_ORIGIN_MAP_TILE_ACCESS ? 'loading' : 'ready');
  const [clusterPluginReady, setClusterPluginReady] = useState(false);

  useEffect(() => {
    setIsTileLayerReady(!shouldDelayTileLayer);
  }, [mapInstanceKey]);

  useEffect(() => {
    if (!USE_SAME_ORIGIN_MAP_TILE_ACCESS) {
      setTileAccessStatus('ready');
      return;
    }

    const abortController = new AbortController();
    let isActive = true;

    setTileAccessStatus('loading');

    void fetch(MAP_TILE_SESSION_URL, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `Map tile session bootstrap failed: ${response.status}`
          );
        }

        if (isActive) {
          setTileAccessStatus('ready');
        }
      })
      .catch(() => {
        if (abortController.signal.aborted || !isActive) {
          return;
        }

        setTileAccessStatus('error');
      });

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    void loadLeafletMarkerCluster()
      .then(() => {
        if (isActive) {
          setClusterPluginReady(true);
        }
      })
      .catch(() => {
        if (isActive) {
          setClusterPluginReady(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleViewportInitialized = useCallback(() => {
    setIsTileLayerReady(true);
  }, []);

  const canRenderMapTiles = isTileLayerReady && tileAccessStatus === 'ready';
  const showTileSessionOverlay =
    USE_SAME_ORIGIN_MAP_TILE_ACCESS && tileAccessStatus === 'loading';
  const showTileSessionError =
    USE_SAME_ORIGIN_MAP_TILE_ACCESS && tileAccessStatus === 'error';

  return (
    <div className="event-map-view space-y-3">
      <div className="relative h-[520px] w-full overflow-hidden rounded-lg border bg-muted/20">
        <LeafletMap
          key={mapInstanceKey}
          center={mapCenter}
          className="h-full w-full"
          theme={mapTheme}
          zoom={mapZoom}
        >
          {!isTileLayerReady ? (
            <InitializeMapViewport
              onReady={handleViewportInitialized}
              points={boundsPoints}
            />
          ) : null}
          {canRenderMapTiles ? <MapTileLayer provider={provider} /> : null}
          {canRenderMapTiles && boundsPoints.length > 1 ? (
            <FitMapToEvents points={boundsPoints} />
          ) : null}
          {canRenderMapTiles ? (
            <EventMarkersLayer
              clusteringEnabled={clusterPluginReady}
              events={mapEvents}
              markerColorScheme={markerColorScheme}
            />
          ) : null}
        </LeafletMap>
        {showTileSessionOverlay ? (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {showTileSessionError ? (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-background/80 px-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('Pages.Home.Infinite.MapTileUnavailable', {
                defaultValue:
                  'Map background is temporarily unavailable. Please reload the page and try again.',
              })}
            </p>
          </div>
        ) : null}
      </div>
      {mapEvents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Home.Infinite.MapNoCoordinates', {
            defaultValue:
              'No events with valid coordinates are available for map view.',
          })}
        </p>
      ) : null}
    </div>
  );
};
