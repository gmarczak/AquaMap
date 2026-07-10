import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

// Jeden współdzielony klient dla całej aplikacji — dzięki temu zapytania do bazy
// niosą token zalogowanego użytkownika (potrzebne pod RLS i zgłoszenia).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
