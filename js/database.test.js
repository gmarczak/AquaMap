import { afterEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ from: fromMock })
}));

vi.mock('./config.js', () => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key'
}));

function queryReturning(result) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => Promise.resolve(result)),
        then: (resolve) => Promise.resolve(result).then(resolve)
    };
    return query;
}

afterEach(() => {
    fromMock.mockReset();
});

describe('fetchPlaces', () => {
    it('returns data on success', async () => {
        fromMock.mockReturnValue(queryReturning({ data: [{ id: 1, nazwa: 'Basen Testowy' }], error: null }));

        const { fetchPlaces } = await import('./database.js');
        const places = await fetchPlaces();

        expect(places).toEqual([{ id: 1, nazwa: 'Basen Testowy' }]);
    });

    it('throws when Supabase returns an error', async () => {
        fromMock.mockReturnValue(queryReturning({ data: null, error: new Error('RLS denied') }));

        const { fetchPlaces } = await import('./database.js');

        await expect(fetchPlaces()).rejects.toThrow('RLS denied');
    });
});

describe('fetchSchedule', () => {
    it('returns an empty array when Supabase returns an error', async () => {
        fromMock.mockReturnValue(queryReturning({ data: null, error: new Error('boom') }));

        const { fetchSchedule } = await import('./database.js');
        const schedule = await fetchSchedule(79);

        expect(schedule).toEqual([]);
    });
});
