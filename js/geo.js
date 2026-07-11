export function distanceKm(lat1, lng1, lat2, lng2) {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Najbliższy basen z podanej listy względem punktu.
// Zwraca { place, km } albo null, gdy lista jest pusta / bez współrzędnych.
export function nearestPlace(lat, lng, places) {
    let best = null;
    let bestKm = Infinity;
    for (const place of places ?? []) {
        if (!place || place.lat == null || place.lng == null) {
            continue;
        }
        const km = distanceKm(lat, lng, place.lat, place.lng);
        if (km < bestKm) {
            bestKm = km;
            best = place;
        }
    }
    return best ? { place: best, km: bestKm } : null;
}
