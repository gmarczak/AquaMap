import { describe, expect, it } from 'vitest';
import { isOpenNow } from './openingHours.js';

describe('isOpenNow', () => {
    it('returns null for unparseable or empty values', () => {
        expect(isOpenNow('Brak')).toBeNull();
        expect(isOpenNow('')).toBeNull();
        expect(isOpenNow(undefined)).toBeNull();
        expect(isOpenNow('09:00-19:00 (sezonowo)')).not.toBeNull();
    });

    it('detects open status for a simple daily range', () => {
        const tuesdayNoon = new Date('2026-06-23T12:00:00');
        const tuesdayMidnight = new Date('2026-06-23T23:30:00');

        expect(isOpenNow('08:00 - 20:00', tuesdayNoon)).toBe(true);
        expect(isOpenNow('08:00 - 20:00', tuesdayMidnight)).toBe(false);
    });

    it('respects per-day-range segments', () => {
        const mondayMorning = new Date('2026-06-22T07:00:00');
        const sundayBeforeOpening = new Date('2026-06-28T05:00:00');
        const sundayLate = new Date('2026-06-28T21:00:00');

        const godziny = 'Pn-Pt 06:00-22:00, Sob-Nd 06:30-22:00';

        expect(isOpenNow(godziny, mondayMorning)).toBe(true);
        expect(isOpenNow(godziny, sundayBeforeOpening)).toBe(false);
        expect(isOpenNow(godziny, sundayLate)).toBe(true);
    });

    it('handles an overnight range that wraps past midnight', () => {
        const lateNight = new Date('2026-06-22T23:30:00');
        const earlyMorning = new Date('2026-06-22T02:00:00');
        const afternoon = new Date('2026-06-22T14:00:00');

        expect(isOpenNow('22:00-06:00', lateNight)).toBe(true);
        expect(isOpenNow('22:00-06:00', earlyMorning)).toBe(true);
        expect(isOpenNow('22:00-06:00', afternoon)).toBe(false);
    });
});
