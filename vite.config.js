import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        rollupOptions: {
            output: {
                manualChunks: {
                    'mapbox-gl': ['mapbox-gl'],
                    'supabase-js': ['@supabase/supabase-js']
                }
            }
        }
    }
});
