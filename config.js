// CONFIGURATION
const SUPABASE_URL = 'https://curqaoiidxgaogwvkwsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cnFhb2lpZHhnYW9nd3Zrd3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTI3MTMsImV4cCI6MjEwMDk2ODcxM30.kur1LucmzDG7Rdt4SOfGMYD6bqVvx6rc0JFmkPqWwyk';

// Initialize Supabase Client globally
// Note: We use 'var' to ensure it attaches to the window object and is accessible everywhere.

if (typeof window.supabase === 'undefined') {
    alert("Critical Error: Database library failed to load.");
} else {
    // 0. Preserve The Factory
    window.SupabaseFactory = window.supabase;

    // 1. Create Client
    const _supabaseClient = window.SupabaseFactory.createClient(SUPABASE_URL, SUPABASE_KEY);

    // 2. Expose as global 'supabase' variable
    window.supabase = _supabaseClient;

    // Also assign to 'supabase' for good measure in this script scope
    var supabase = _supabaseClient;
}
