 /* const SUPABASE_URL = process.env.SUPABASE_URL; 
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://ktniwoewldeekddcxykk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bml3b2V3bGRlZWtkZGN4eWtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NDY0MzksImV4cCI6MjExMDEyMjQzOX0.MrhqbOwAUNtxCxcU1_C_phwajG4b9hh71etHzTg6HjU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);