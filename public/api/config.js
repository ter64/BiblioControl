import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ktniwoewldeekddcxykk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_M1uw1q8iabuRZrgLqMF9EA_3PRn_Iw-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (typeof window !== 'undefined') {
    window.supabase = supabase;
}