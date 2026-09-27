import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@shared', replacement: path.resolve(__dirname, 'supabase/functions/_shared') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // Arquivos compartilhados com as Edge Functions importam o zod no formato do Deno
      { find: /^npm:zod@3$/, replacement: 'zod' },
    ],
  },
});
