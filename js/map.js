export let map;

export function initMap(containerId) {
    mapboxgl.accessToken = 'pk.eyJ1IjoiZ21hcmN6YWsiLCJhIjoiY21xb3lndW0xMDFxZzJyc2NjdjFuZXZxMCJ9.DUJPnhHCzHUs_M34h6dEnQ'

    map = new mapboxgl.Map({
        container: 'map', // container ID
        style: 'mapbox://styles/mapbox/streets-v11', // style URL
        center: [19.1451, 51.9194], // starting position [lng, lat]
        zoom: 5.5 // starting zoom
    });

    map.addControl(new mapboxgl.NavigationControl());

    return map;
}

export function addMarker(place, onMarkerClick) {
    const popupContent = `<h3 style="margin: 0; font-size: 13px;">${place.nazwa}</h3>`;

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