import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/** Klient Supabase dla Server Components i Route Handlers (sesja z ciasteczek). */
export async function supabaseServer() {
  const store = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient<Database, "swim">(url, key, {
    db: { schema: "swim" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Wywołane z Server Componentu: ciasteczka odświeża proxy.ts
        }
      },
    },
  });
}
