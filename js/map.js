import { MAPBOX_ACCESS_TOKEN } from './config.js';
import { escapeHtml } from './utils.js';

export let map;

export function initMap(containerId) {
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN

    map = new mapboxgl.Map({
        container: containerId, // container ID
        style: 'mapbox://styles/mapbox/streets-v11', // style URL
        center: [19.1451, 51.9194], // starting position [lng, lat]
        zoom: 5.5 // starting zoom
    });

    map.addControl(new mapboxgl.NavigationControl());

    map.addControl(new mapboxgl.GeolocateControl({
        // Ogranicz docelowe przybliżenie po geolokalizacji (zamiast maksymalnego).
        fitBoundsOptions: { maxZoom: 14 },
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true
    }));

    return map;
}

export function addMarker(place, onMarkerClick) {
    const popupContent = `<h3 style="margin: 0; font-size: 13px;">${escapeHtml(place.nazwa)}</h3>`;

    const marker = new mapboxgl.Marker()
        .setLngLat([place.lng, place.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(popupContent))
        .addTo(map);

    marker.getElement().addEventListener('click', () => {
        flyToLocation(place.lat, place.lng);
        if (onMarkerClick) {
            onMarkerClick(place);
        }
    });
}

export function flyToLocation(lat, lng) {
    map.flyTo({
        center: [lng, lat],
        zoom: 13,
        essential: true
    });
}