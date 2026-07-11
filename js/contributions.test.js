import { afterEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ from: fromMock })
}));

vi.mock('./config.js', () => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key'
}));

// Elastyczny mock łańcucha zapytań Supabase. Zapamiętuje argumenty insert/update.
function makeQuery(result) {
    const query = {
        _insert: null,
        _update: null,
        insert: vi.fn(payload => { query._insert = payload; return query; }),
        update: vi.fn(payload => { query._update = payload; return query; }),
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => Promise.resolve(result)),
        single: vi.fn(() => Promise.resolve(result)),
        then: resolve => Promise.resolve(result).then(resolve)
    };
    return query;
}

afterEach(() => {
    fromMock.mockReset();
});

describe('submitNewPlace', () => {
    it('inserts a new_place contribution and returns the row', async () => {
        const query = makeQuery({ data: { id: 'c1', status: 'pending' }, error: null });
        fromMock.mockReturnValue(query);

        const { submitNewPlace } = await import('./contributions.js');
        const row = await submitNewPlace({ nazwa: 'Basen X' });

        expect(query.insert).toHaveBeenCalledWith({ kind: 'new_place', payload: { nazwa: 'Basen X' } });
        expect(row).toEqual({ id: 'c1', status: 'pending' });
    });

    it('throws when Supabase returns an error', async () => {
        fromMock.mockReturnValue(makeQuery({ data: null, error: new Error('RLS denied') }));
        const { submitNewPlace } = await import('./contributions.js');
        await expect(submitNewPlace({})).rejects.toThrow('RLS denied');
    });
});

describe('submitEditPlace', () => {
    it('inserts an edit_place contribution with place_id', async () => {
        const query = makeQuery({ data: { id: 'c2' }, error: null });
        fromMock.mockReturnValue(query);

        const { submitEditPlace } = await import('./contributions.js');
        await submitEditPlace(42, { godziny: '6-22' });

        expect(query.insert).toHaveBeenCalledWith({ kind: 'edit_place', place_id: 42, payload: { godziny: '6-22' } });
    });
});

describe('submitSchedule', () => {
    it('inserts a schedule contribution with place_id', async () => {
        const query = makeQuery({ data: { id: 'c3' }, error: null });
        fromMock.mockReturnValue(query);

        const { submitSchedule } = await import('./contributions.js');
        await submitSchedule(7, { replace: true, entries: [] });

        expect(query.insert).toHaveBeenCalledWith({ kind: 'schedule', place_id: 7, payload: { replace: true, entries: [] } });
    });
});

describe('reviewContribution', () => {
    it('updates status and review note', async () => {
        const query = makeQuery({ data: { id: 'c4', status: 'approved' }, error: null });
        fromMock.mockReturnValue(query);

        const { reviewContribution } = await import('./contributions.js');
        const row = await reviewContribution('c4', 'approved', 'ok');

        expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', review_note: 'ok' }));
        expect(row.status).toBe('approved');
    });
});

describe('listPending', () => {
    it('returns pending contributions', async () => {
        fromMock.mockReturnValue(makeQuery({ data: [{ id: 'c5', status: 'pending' }], error: null }));
        const { listPending } = await import('./contributions.js');
        expect(await listPending()).toEqual([{ id: 'c5', status: 'pending' }]);
    });

    it('throws when Supabase returns an error', async () => {
        fromMock.mockReturnValue(makeQuery({ data: null, error: new Error('boom') }));
        const { listPending } = await import('./contributions.js');
        await expect(listPending()).rejects.toThrow('boom');
    });
});
