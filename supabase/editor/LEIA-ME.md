# Edge Functions em arquivo único

Versões de cada Edge Function com o código compartilhado (`_shared/`) embutido, para colar no editor do painel
do Supabase (Edge Functions → Deploy a new function → Via Editor). O nome da função é o nome do arquivo
(`coletar`, `foto`, `qualificar`, `gerar-previa`, `track`, `optout`, `pipeline`).
Se o editor sugerir outro endereço, anote-o e ajuste `supabase/functions/_shared/enderecos.ts`.

Gerados por `node scripts/gerar-editor.mjs` a partir de `supabase/functions/` — a fonte oficial continua lá.
Na função `foto`, desligue "Verify JWT" (as imagens são carregadas sem login). As demais funcionam com ele ligado.
