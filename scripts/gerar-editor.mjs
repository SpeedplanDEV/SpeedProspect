// Gera versões de arquivo único das Edge Functions (supabase/editor/*.ts) para colar no
// editor do painel do Supabase. Uso: node scripts/gerar-editor.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const RAIZ = resolve('supabase/functions');
const SAIDA = resolve('supabase/editor');
const FUNCOES = ['coletar', 'foto', 'qualificar', 'gerar-previa', 'track', 'optout', 'pipeline', 'meta-ativos', 'meta-sync', 'ranking'];

function montar(nome) {
  const vistos = new Set();
  const npm = new Map(); // especificador → conjunto de nomes importados
  const partes = [];

  const visitar = (arquivo) => {
    if (vistos.has(arquivo)) return;
    vistos.add(arquivo);
    let src = readFileSync(arquivo, 'utf8');
    // Dependências locais primeiro (ordem de declaração)
    for (const m of src.matchAll(/^import\s+(?:type\s+)?[\s\S]*?from\s+'(\.[^']+)';\s*$/gm)) {
      visitar(join(dirname(arquivo), m[1]));
    }
    for (const m of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+'(npm:[^']+)';\s*$/gm)) {
      // "type X" só vira import de tipo se X nunca for importado como valor
      const nomes = m[1].replace(/[{}]/g, '').split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const mapa = npm.get(m[2]) ?? new Map();
      for (const n of nomes) {
        const tipo = n.startsWith('type ');
        const base = n.replace(/^type /, '');
        mapa.set(base, (mapa.get(base) ?? true) && tipo);
      }
      npm.set(m[2], mapa);
    }
    src = src
      .replace(/^import\s+[\s\S]*?from\s+'[^']+';\s*\n/gm, '')
      .replace(/^export\s+(?=(const|function|async|interface|type|class|let)\b)/gm, '')
      .replace(/^export\s+\{[^}]*\}\s+from\s+'[^']+';\s*\n/gm, '');
    partes.push(`// ===== ${arquivo.slice(RAIZ.length + 1)} =====\n${src.trim()}\n`);
  };

  visitar(join(RAIZ, nome, 'index.ts'));
  const imports = [...npm]
    .map(([esp, mapa]) => `import { ${[...mapa].map(([n, tipo]) => (tipo ? `type ${n}` : n)).join(', ')} } from '${esp}';`)
    .join('\n');
  return `// SpeedProspect — Edge Function \`${nome}\` (arquivo único para o editor do Supabase)\n// Gerado por scripts/gerar-editor.mjs a partir de supabase/functions — não edite à mão.\n${imports}\n\n${partes.join('\n')}`;
}

mkdirSync(SAIDA, { recursive: true });
for (const f of FUNCOES) {
  writeFileSync(join(SAIDA, `${f}.ts`), montar(f));
  console.log(`supabase/editor/${f}.ts`);
}
