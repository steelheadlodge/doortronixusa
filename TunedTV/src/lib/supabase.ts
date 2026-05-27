import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbjxfitpjocaooxxafri.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBianhmaXRwam9jYW9veHhhZnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTQ3MzQsImV4cCI6MjA5NDczMDczNH0.zUXgAqjWQM0x7VDGtwiVcHakceD9yjjHQgAjneavEOo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
