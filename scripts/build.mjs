import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
const strip = (s) => s.replace(/^export\s+/gm, '');
const script = [
  '// ---- engine.js ----', strip(readFileSync('src/engine.js', 'utf8')),
  '// ---- glossary.js ----', strip(readFileSync('src/glossary.js', 'utf8')),
  '// ---- app.js ----', readFileSync('src/app.js', 'utf8'),
].join('\n');
const page = readFileSync('src/index.template.html', 'utf8').replace('/*__SCRIPT__*/', () => script);

// 1) 아티팩트용: 본문만 (게시할 때 문서 뼈대가 씌워짐)
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', page);
copyFileSync('data/annex-data.json', 'artifact/annex-data.json');

// 2) Vercel·로컬용: 완전한 문서
const cut = page.indexOf('<header class="gnav">');
if (cut < 0) throw new Error('template body start not found');
const head = page.slice(0, cut);
const body = page.slice(cut);
const full = `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}</head>\n<body>\n${body}</body>\n</html>\n`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', full);
copyFileSync('data/annex-data.json', 'dist/annex-data.json');
console.log('built artifact/index.html and dist/index.html', full.length);
