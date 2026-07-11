import { describe, expect, it } from 'vitest';
import { distanceKm, nearestPlace } from './geo.js';

describe('distanceKm', () => {
    it('returns 0 for identical points', () => {
        expect(distanceKm(51.9194, 19.1451, 51.9194, 19.1451)).toBe(0);
    });

    it('returns the approximate distance between Warsaw and Krakow', () => {
        const warsaw = [52.2297, 21.0122];
        const krakow = [50.0647, 19.9450];

        const result = distanceKm(...warsaw, ...krakow);

        expect(result).toBeGreaterThan(250);
        expect(result).toBeLessThan(260);
    });
});

describe('nearestPlace', () => {
    const places = [
        { id: 1, nazwa: 'Basen A', lat: 50.0647, lng: 19.9450 }, // Kraków
        { id: 2, nazwa: 'Basen B', lat: 52.2297, lng: 21.0122 }  // Warszawa
    ];

    it('returns null for an empty or missing list', () => {
        expect(nearestPlace(50, 19, [])).toBeNull();
        expect(nearestPlace(50, 19, null)).toBeNull();
    });

    it('picks the closest place', () => {
        const result = nearestPlace(50.07, 19.95, places);
        expect(result.place.id).toBe(1);
        expect(result.km).toBeLessThan(1);
    });

    it('ignores places without coordinates', () => {
        const withGaps = [{ id: 9, nazwa: 'Bez GPS', lat: null, lng: null }, ...places];
        const result = nearestPlace(52.23, 21.01, withGaps);
        expect(result.place.id).toBe(2);
    });

    it('detects a duplicate within the ~150 m radius', () => {
        // Punkt ~50 m od Basenu A — powinien wpaść w próg 150 m.
        const result = nearestPlace(50.06515, 19.9450, places);
        expect(result.place.id).toBe(1);
        expect(result.km * 1000).toBeLessThan(150);
    });

    it('does not flag a far point as duplicate', () => {
        const result = nearestPlace(50.07, 19.95, places);
        expect(result.km * 1000).toBeGreaterThan(150);
    });
});
