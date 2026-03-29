import { config } from '@/config';
import { createProxiedMapyProvider } from '@/lib/maps/mapy';
import { PATHNAMES } from '@/lib/paths/pathnames';
import type { Event } from '@/types/event';
import {
  resolveSupportedMapTileLang,
  type SupportedMapTileMapset,
} from '@repo/shared';
import { useNavigate } from '@tanstack/react-router';
import { divIcon, marker } from 'leaflet';
import i18n, { type TFunction } from 'i18next';
import { useTheme } from 'next-themes';
import {
  LeafletMap,
  MapTileLayer,
  markerPresets,
  useLeafletMap,
} from 'react-mapy';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './EventMapView.css';

interface EventMapViewProps {
  events: Event[];
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
  max: number,
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const toMappableEvent = (event: Event): MappableEvent | null => {
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
    location: event.location,
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

const buildOfeedMarkerIcon = (colorScheme: EventMarkerColorScheme) => {
  const assetSrc =
    OFEED_MARKER_PRESET.assetSrcByColorScheme?.[colorScheme] ??
    OFEED_MARKER_PRESET.assetSrc;

  if (!assetSrc) {
    return undefined;
  }

  const [width, height] = MARKER_SIZE;
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
      },
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
        },
      );
    }

    onReady();
  }, [map, onReady, points]);

  return null;
}

function EventMarkersLayer({
  events,
  markerColorScheme,
}: {
  events: readonly MappableEvent[];
  markerColorScheme: EventMarkerColorScheme;
}) {
  const map = useLeafletMap();
  const navigate = useNavigate();

  const markerIcon = useMemo(
    () => buildOfeedMarkerIcon(markerColorScheme),
    [markerColorScheme],
  );

  useEffect(() => {
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
            },
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

      markerLayer.addTo(map);
      return markerLayer;
    });

    return () => {
      markerLayers.forEach(layer => {
        layer.remove();
      });
    };
  }, [events, map, markerIcon, navigate]);

  return null;
}

export const EventMapView = ({ events, t }: EventMapViewProps) => {
  const { resolvedTheme } = useTheme();
  const tileLanguage = normalizeTileLanguage(
    i18n.resolvedLanguage ?? i18n.language,
  );
  const mapTheme = resolvedTheme === 'dark' ? 'dark' : 'neutral';
  const markerColorScheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  const mapEvents = useMemo(
    () =>
      events
        .map(toMappableEvent)
        .filter((event): event is MappableEvent => event !== null),
    [events],
  );

  const boundsPoints = useMemo(
    () =>
      mapEvents.map(({ latitude, longitude }) => ({
        lat: latitude,
        lng: longitude,
      })),
    [mapEvents],
  );

  const provider = useMemo(
    () =>
      createProxiedMapyProvider({
        language: tileLanguage,
        variant: MAP_VARIANT,
      }),
    [tileLanguage],
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
  const [isTileLayerReady, setIsTileLayerReady] = useState(
    !shouldDelayTileLayer,
  );

  useEffect(() => {
    setIsTileLayerReady(!shouldDelayTileLayer);
  }, [mapInstanceKey]);

  const handleViewportInitialized = useCallback(() => {
    setIsTileLayerReady(true);
  }, []);

  return (
    <div className="event-map-view space-y-3">
      <div className="h-[520px] w-full overflow-hidden rounded-lg border bg-muted/20">
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
          {isTileLayerReady ? <MapTileLayer provider={provider} /> : null}
          {isTileLayerReady && boundsPoints.length > 1 ? (
            <FitMapToEvents points={boundsPoints} />
          ) : null}
          <EventMarkersLayer
            events={mapEvents}
            markerColorScheme={markerColorScheme}
          />
        </LeafletMap>
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
