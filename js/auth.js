import { supabase } from './supabaseClient.js';

// Cienka warstwa nad Supabase Auth. Reszta aplikacji korzysta tylko z tych
// funkcji, nie dotykając bezpośrednio supabase.auth.

export async function getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
}

// Wywołuje callback od razu z bieżącym użytkownikiem i przy każdej zmianie
// stanu logowania. Zwraca funkcję do odsubskrybowania.
export function onAuthChange(callback) {
    supabase.auth.getUser().then(({ data }) => callback(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
}

export function signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
}

// Logowanie linkiem e-mail (magic link) — nie wymaga konfiguracji OAuth.
export function signInWithMagicLink(email) {
    return supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
    });
}

export function signOut() {
    return supabase.auth.signOut();
}

// Profil z tabeli public.profiles (display_name, role, xp, level).
export async function getProfile(userId) {
    if (!userId) {
        return null;
    }
    const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, role, xp, level')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Nie udało się pobrać profilu:', error);
        return null;
    }
    return data;
}
