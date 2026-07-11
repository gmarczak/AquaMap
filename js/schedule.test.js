import { describe, expect, it } from 'vitest';
import { naMinuty, axisRange, axisTicks, lanesForSection } from './schedule.js';

describe('naMinuty', () => {
    it('parses HH:MM to minutes', () => {
        expect(naMinuty('08:00')).toBe(480);
        expect(naMinuty('10:45')).toBe(645);
        expect(naMinuty('00:00')).toBe(0);
    });

    it('is resilient to junk input', () => {
        expect(naMinuty('')).toBe(0);
        expect(naMinuty('7')).toBe(420);
    });
});

describe('axisRange', () => {
    it('falls back to 6–22 for empty input', () => {
        expect(axisRange([])).toEqual({ OD: 360, DO: 1320, ZAKRES: 960 });
    });

    it('rounds to full hours around the data', () => {
        const sloty = [{ od: '08:30', do: '10:45' }, { od: '14:00', do: '15:15' }];
        // start 8:30 -> floor 8:00 (480), end 15:15 -> ceil 16:00 (960)
        expect(axisRange(sloty)).toEqual({ OD: 480, DO: 960, ZAKRES: 480 });
    });

    it('guarantees at least a 1h range', () => {
        const sloty = [{ od: '09:10', do: '09:20' }];
        const r = axisRange(sloty);
        expect(r.DO - r.OD).toBeGreaterThanOrEqual(60);
    });
});

describe('axisTicks', () => {
    it('uses a 1h step for short ranges', () => {
        expect(axisTicks(480, 900)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    });

    it('widens the step for long ranges', () => {
        // 6:00–22:00 = 16h -> krok 3
        expect(axisTicks(360, 1320)).toEqual([6, 9, 12, 15, 18, 21]);
    });
});

describe('lanesForSection', () => {
    it('numbers lanes 1..max including empty lanes', () => {
        const sloty = [{ sekcja: 'A', tor: 3 }, { sekcja: 'A', tor: 1 }];
        expect(lanesForSection(sloty, 'A')).toEqual([1, 2, 3]);
    });

    it('uses liczbaTorow for section-less pools', () => {
        const sloty = [{ sekcja: null, tor: 2 }];
        expect(lanesForSection(sloty, null, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('returns empty when there are no lanes', () => {
        expect(lanesForSection([], 'A')).toEqual([]);
        expect(lanesForSection([{ sekcja: 'A', tor: 1 }], 'B')).toEqual([]);
    });
});
