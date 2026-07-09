import { describe, expect, it } from 'vitest';
import { isOpenNow, getTodayHours } from './openingHours.js';

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

    it('shares one time range across a comma-separated list of days', () => {
        // "Pn-Śr" dzieli godziny 06:00-22:00 z "Pt-Nd"; "Czw" ma własne 07:00-22:00.
        const godziny = 'Pn-Śr, Pt-Nd 06:00-22:00, Czw 07:00-22:00';
        const wtorek0630 = new Date('2026-06-23T06:30:00'); // Wt (w Pn-Śr) -> otwarte
        const czwartek0630 = new Date('2026-06-25T06:30:00'); // Czw -> jeszcze zamknięte (od 07:00)
        const czwartek0730 = new Date('2026-06-25T07:30:00'); // Czw -> otwarte

        expect(isOpenNow(godziny, wtorek0630)).toBe(true);
        expect(isOpenNow(godziny, czwartek0630)).toBe(false);
        expect(isOpenNow(godziny, czwartek0730)).toBe(true);
    });

    it('treats "zamknięte" days as closed', () => {
        const godziny = 'Pn-Pt 08:00-22:00, Sob 08:00-21:00, Nd zamknięte';
        const niedziela = new Date('2026-06-28T12:00:00'); // Nd -> zamknięte

        expect(isOpenNow(godziny, niedziela)).toBe(false);
    });
});

describe('getTodayHours', () => {
    it('returns today\'s hours from a shared day list', () => {
        const godziny = 'Pn-Śr, Pt-Nd 06:00-22:00, Czw 07:00-22:00';
        const wtorek = new Date('2026-06-23T10:00:00'); // Wt należy do Pn-Śr

        expect(getTodayHours(godziny, wtorek)).toBe('06:00–22:00');
    });

    it('returns null when the format has no recognizable hours', () => {
        expect(getTodayHours('Recepcja 24h (basen wg regulaminu hotelu)')).toBeNull();
        expect(getTodayHours('Brak')).toBeNull();
    });
});
