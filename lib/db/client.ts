"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

let client: ReturnType<typeof createBrowserClient<Database, "swim">> | null = null;

/** Jeden klient Supabase na całą przeglądarkę. */
export function supabaseBrowser() {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createBrowserClient<Database, "swim">(url, key, { db: { schema: "swim" } });
  }
  return client;
}

export type Supabase = ReturnType<typeof supabaseBrowser>;
