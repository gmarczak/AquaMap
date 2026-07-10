import { supabase } from './supabaseClient.js';

// Warstwa zgłoszeń społeczności. `author` wypełnia się serwerowo (DEFAULT
// auth.uid()), a RLS pilnuje, że można wstawić tylko własne zgłoszenie.

// Zgłoszenie edycji istniejącego basenu (godziny/cennik/strona).
export async function submitEditPlace(placeId, payload) {
    const { data, error } = await supabase
        .from('contributions')
        .insert({ kind: 'edit_place', place_id: placeId, payload })
        .select()
        .single();

    if (error) {
        throw error;
    }
    return data;
}

// Zgłoszenie nowego basenu.
export async function submitNewPlace(payload) {
    const { data, error } = await supabase
        .from('contributions')
        .insert({ kind: 'new_place', payload })
        .select()
        .single();

    if (error) {
        throw error;
    }
    return data;
}

// Zgłoszenie harmonogramu torów dla basenu.
// payload: { replace: bool, entries: [{ dzien, tor, od, do, status, sekcja, opis }] }
export async function submitSchedule(placeId, payload) {
    const { data, error } = await supabase
        .from('contributions')
        .insert({ kind: 'schedule', place_id: placeId, payload })
        .select()
        .single();

    if (error) {
        throw error;
    }
    return data;
}

// Kolejka moderacji — dostępna tylko dla moderatorów (RLS).
export async function listPending() {
    const { data, error } = await supabase
        .from('contributions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }
    return data;
}

// Zatwierdzenie/odrzucenie zgłoszenia (moderator).
export async function reviewContribution(id, status, note) {
    const { data, error } = await supabase
        .from('contributions')
        .update({ status, review_note: note ?? null, reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }
    return data;
}
