// Supabase client — the single shared connection to our database.
// Anywhere in the app that needs to read/write data imports `supabase` from here.
//
// The URL and anon key come from .env.local (which is gitignored).
// Variables prefixed with NEXT_PUBLIC_ are exposed to browser code by Next.js.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
