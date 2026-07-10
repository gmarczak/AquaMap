import { supabase } from './supabaseClient.js';
import { SUPABASE_URL } from './config.js';

const BUCKET = 'place-photos';

export function photoUrl(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Wgrywa plik do Storage, tworzy rekord zdjęcia (pending) i zgłoszenie do
// moderacji. Zaufani zatwierdzają się od razu (trigger na contributions).
export async function uploadPhoto(placeId, file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('Musisz być zalogowany.');
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const rand = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `${placeId}/${rand}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/jpeg'
    });
    if (upErr) {
        throw upErr;
    }

    const { data: photo, error: pErr } = await supabase
        .from('place_photos')
        .insert({ place_id: placeId, storage_path: path })
        .select()
        .single();
    if (pErr) {
        throw pErr;
    }

    const { data: contrib, error: cErr } = await supabase
        .from('contributions')
        .insert({ kind: 'photo', place_id: placeId, payload: { photo_id: photo.id, storage_path: path } })
        .select()
        .single();
    if (cErr) {
        throw cErr;
    }

    return { photo, status: contrib.status };
}

export async function listApprovedPhotos(placeId) {
    const { data, error } = await supabase
        .from('place_photos')
        .select('storage_path')
        .eq('place_id', placeId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
    if (error) {
        throw error;
    }
    return (data || []).map(row => photoUrl(row.storage_path));
}
