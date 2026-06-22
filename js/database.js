const supabaseUrl = "https://yxjnjrborhatabnmjlqe.supabase.co"
const supabasekey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4am5qcmJvcmhhdGFibm1qbHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTcxNDUsImV4cCI6MjA5NzY5MzE0NX0.vs4dPfY7tVMsDNu_fVBXtF60iA51xdo71XQnzlbhlu4"
const supabase = window.supabase.createClient(supabaseUrl, supabasekey)


export async function fetchPlaces() {
    const { data, error } = await supabase.from('places').select('*');

    if (error) {
        console.error('Error fetching data from Supabase:', error);
        return [];
    }
    return data;
}
