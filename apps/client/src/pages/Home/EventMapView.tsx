import { apiUrl } from '@/lib/api/endpoints';
import { PATHNAMES } from '@/lib/paths/pathnames';
import type { Event } from '@/types/event';
import { config } from '@/config';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import i18n, { TFunction } from 'i18next';
import { useEffect, useMemo, useRef } from 'react';

interface EventMapViewProps {
  events: Event[];
  t: TFunction;
}

interface MappableEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  featuredImage?: string;
  latitude: number;
  longitude: number;
}

const DEFAULT_CENTER: [number, number] = [49.8175, 15.473];
const DEFAULT_ZOOM = 7;
const FLAG_ICON_URL = '/images/icons/map_icon.svg';
const MIN_ZOOM = 0;
const MAX_ZOOM = 18;
const MARKER_SIZE = 30;
const MARKER_IMAGE_SIZE = 24;
const CLUSTER_SIZE = 40;

const normalizeTileLang = (value: string | undefined): string => {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return normalized && normalized.length > 0 ? normalized : 'en';
};

const markerIcon = L.divIcon({
  className: 'event-map-marker',
  html: `<img src="${FLAG_ICON_URL}" alt="Orienteering flag" style="display:block;width:${MARKER_IMAGE_SIZE}px;height:${MARKER_IMAGE_SIZE}px;margin:${(MARKER_SIZE - MARKER_IMAGE_SIZE) / 2}px;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));" />`,
  iconSize: [MARKER_SIZE, MARKER_SIZE],
  iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
  popupAnchor: [0, -(MARKER_SIZE / 2)],
});

const createClusterIcon = (cluster: L.MarkerCluster) =>
  L.divIcon({
    className: 'event-map-cluster',
    html: `<div><span>${cluster.getChildCount()}</span></div>`,
    iconSize: [CLUSTER_SIZE, CLUSTER_SIZE],
    iconAnchor: [CLUSTER_SIZE / 2, CLUSTER_SIZE / 2],
  });

const hasValidCoordinate = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

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
    return `${config.BASE_API_URL}${featuredImage}`;
  }

  return featuredImage;
};

export const EventMapView = ({ events, t }: EventMapViewProps) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const tileLang = normalizeTileLang(i18n.resolvedLanguage ?? i18n.language);
  const zoomInTitle = t('Pages.Home.Infinite.MapZoomIn', {
    defaultValue: 'Zoom in',
  });
  const zoomOutTitle = t('Pages.Home.Infinite.MapZoomOut', {
    defaultValue: 'Zoom out',
  });
  const mapAttributionOthers = t('Pages.Home.Infinite.MapAttributionOthers', {
    defaultValue: 'and others',
  });

  const mapEvents = useMemo(
    () =>
      events
        .map(toMappableEvent)
        .filter((event): event is MappableEvent => event !== null),
    [events]
  );

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer(apiUrl('mapTile', '{z}', '{x}', '{y}', { lang: tileLang }), {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: MAX_ZOOM,
      tileSize: 256,
      attribution:
        `<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener noreferrer">&copy; Seznam.cz a.s. ${mapAttributionOthers}</a>`,
    }).addTo(map);

    const zoomControl = L.control.zoom({
      position: 'topleft',
      zoomInTitle,
      zoomOutTitle,
    });
    zoomControl.addTo(map);

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 42,
      iconCreateFunction: createClusterIcon,
    });

    const LogoControl = L.Control.extend({
      options: {
        position: 'bottomleft',
      },
      onAdd() {
        const container = L.DomUtil.create('div');
        const link = L.DomUtil.create('a', '', container);
        link.setAttribute('href', 'https://mapy.com/');
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        link.innerHTML =
          '<img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.cz" />';
        L.DomEvent.disableClickPropagation(link);
        return container;
      },
    });

    const logoControl = new LogoControl();
    map.addControl(logoControl);

    if (mapEvents.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    } else if (mapEvents.length === 1) {
      const singleEvent = mapEvents[0];
      if (singleEvent) {
        map.setView([singleEvent.latitude, singleEvent.longitude], 13);
      }
    } else {
      const bounds = L.latLngBounds(
        mapEvents.map(event => [event.latitude, event.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: MAX_ZOOM - 1 });
    }

    for (const event of mapEvents) {
      const marker = L.marker([event.latitude, event.longitude], {
        icon: markerIcon,
      });

      const popupWrapper = document.createElement('div');
      popupWrapper.style.width = '220px';
      popupWrapper.style.overflow = 'hidden';
      popupWrapper.style.borderRadius = '12px';
      popupWrapper.style.background = 'var(--popover)';
      popupWrapper.style.color = 'var(--popover-foreground)';

      const eventCardLink = document.createElement('a');
      eventCardLink.href = PATHNAMES.eventDetail(event.id).url;
      eventCardLink.style.display = 'block';
      eventCardLink.style.textDecoration = 'none';
      eventCardLink.style.color = 'inherit';
      popupWrapper.appendChild(eventCardLink);

      const imageUrl = resolveFeaturedImageUrl(event.featuredImage);
      if (imageUrl) {
        const eventImage = document.createElement('img');
        eventImage.src = imageUrl;
        eventImage.alt = event.name;
        eventImage.style.width = '100%';
        eventImage.style.height = '110px';
        eventImage.style.objectFit = 'cover';
        eventCardLink.appendChild(eventImage);
      }

      const textWrapper = document.createElement('div');
      textWrapper.style.padding = '10px 12px';
      textWrapper.style.display = 'grid';
      textWrapper.style.gap = '4px';
      eventCardLink.appendChild(textWrapper);

      const eventTitle = document.createElement('div');
      eventTitle.style.fontWeight = '700';
      eventTitle.style.color = 'inherit';
      eventTitle.textContent = event.name;
      textWrapper.appendChild(eventTitle);

      const dateText = document.createElement('div');
      dateText.style.fontSize = '12px';
      dateText.style.color = 'var(--muted-foreground)';
      dateText.textContent = event.date;
      textWrapper.appendChild(dateText);

      const locationText = document.createElement('div');
      locationText.style.fontSize = '12px';
      locationText.style.color = 'var(--muted-foreground)';
      locationText.textContent = event.location;
      textWrapper.appendChild(locationText);

      marker.bindPopup(popupWrapper, {
        className: 'event-map-popup',
      });

      clusterGroup.addLayer(marker);
    }

    clusterGroup.addTo(map);

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    return () => {
      window.clearTimeout(resizeTimer);
      clusterGroup.remove();
      zoomControl.remove();
      logoControl.remove();
      map.remove();
    };
  }, [mapAttributionOthers, mapEvents, tileLang, zoomInTitle, zoomOutTitle]);

  return (
    <div className="space-y-3">
      <div className="h-[520px] w-full overflow-hidden rounded-lg border bg-muted/20">
        <div ref={mapElementRef} className="event-map-surface h-full w-full" />
      </div>
      {mapEvents.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Home.Infinite.MapNoCoordinates', {
            defaultValue:
              'No events with valid coordinates are available for map view.',
          })}
        </p>
      )}
    </div>
  );
};
