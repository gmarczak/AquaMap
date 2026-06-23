import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_ACCESS_TOKEN } from './config.js';

export { distanceKm } from './geo.js';

export let map;
export let geolocateControl;

const PLACES_SOURCE_ID = 'places';
const placesById = new Map();

function prefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function initMap(containerId) {
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN

    map = new mapboxgl.Map({
        container: containerId, // container ID
        style: prefersDark() ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v11',
        center: [19.1451, 51.9194], // starting position [lng, lat], overridden by fitBounds once places load
        zoom: 5
    });

    map.addControl(new mapboxgl.NavigationControl());

    geolocateControl = new mapboxgl.GeolocateControl({
        // Ogranicz docelowe przybliżenie po geolokalizacji (zamiast maksymalnego).
        fitBoundsOptions: { maxZoom: 14 },
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true
    });
    map.addControl(geolocateControl);

    return map;
}

/** @returns {GeoJSON.FeatureCollection} */
function toFeatureCollection(places) {
    return {
        type: 'FeatureCollection',
        features: places.map(place => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
            properties: { id: place.id }
        }))
    };
}

function fitToPlaces(places) {
    if (places.length === 0) {
        return;
    }

    const bounds = places.reduce(
        (acc, place) => acc.extend([place.lng, place.lat]),
        new mapboxgl.LngLatBounds([places[0].lng, places[0].lat], [places[0].lng, places[0].lat])
    );

    map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
}

// Markery jako klastrowane źródło GeoJSON (zamiast pojedynczych DOM-markerów),
// żeby gęsto rozmieszczone baseny nie nachodziły na siebie przy oddaleniu mapy.
export function setPlaces(places, onPlaceClick) {
    placesById.clear();
    places.forEach(place => placesById.set(place.id, place));

    const data = toFeatureCollection(places);
    const existingSource = /** @type {mapboxgl.GeoJSONSource | undefined} */ (map.getSource(PLACES_SOURCE_ID));

    if (existingSource) {
        existingSource.setData(data);
        fitToPlaces(places);
        return;
    }

    map.addSource(PLACES_SOURCE_ID, {
        type: 'geojson',
        data,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
    });

    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: PLACES_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': ['step', ['get', 'point_count'], 'rgba(47, 111, 237, 0.75)', 10, 'rgba(47, 111, 237, 0.88)', 30, 'rgba(28, 79, 170, 0.92)'],
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: PLACES_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 12
        },
        paint: {
            'text-color': '#ffffff'
        }
    });

    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: PLACES_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': '#2f6fed',
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    map.on('click', 'clusters', event => {
        const features = map.queryRenderedFeatures(event.point, { layers: ['clusters'] });
        const clusterId = features[0].properties.cluster_id;
        const source = /** @type {mapboxgl.GeoJSONSource} */ (map.getSource(PLACES_SOURCE_ID));

        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error) {
                return;
            }
            map.easeTo({ center: /** @type {any} */ (features[0].geometry).coordinates, zoom });
        });
    });

    map.on('click', 'unclustered-point', event => {
        const feature = event.features?.[0];
        if (!feature) {
            return;
        }

        const place = placesById.get(feature.properties.id);
        if (!place) {
            return;
        }

        flyToLocation(place.lat, place.lng);
        if (onPlaceClick) {
            onPlaceClick(place);
        }
    });

    ['clusters', 'unclustered-point'].forEach(layer => {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    });

    fitToPlaces(places);
}

export function flyToLocation(lat, lng) {
    map.flyTo({
        center: [lng, lat],
        zoom: 13,
        essential: true
    });
}
