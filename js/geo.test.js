import { describe, expect, it } from 'vitest';
import { distanceKm } from './geo.js';

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
