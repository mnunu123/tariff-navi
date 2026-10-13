// 관세 부속서 내비 화면. engine.js, glossary.js의 함수가 같은 스크립트 안에 먼저 들어온다.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todaySeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

const EXAMPLES = [
  { label: '볼트', code: '7318.15.20' },
  { label: '지게차', code: '8427.10.40' },
  { label: '농업용 트랙터 변속기', code: '8708.40.30' },
  { label: '기어', code: '8483.40.10' },
  { label: '금속 랙', code: '9403.20.0075' },
  { label: '6자리만 7326.90', code: '7326.90' },
  { label: '제품명으로 굴착기', q: '굴착기' },
];

const WATCH_EXAMPLES = [
  { name: '볼트', code: '7318.15.20' },
  { name: '지게차', code: '8427.10.40' },
  { name: '농업용 트랙터 변속기', code: '8708.40.30' },
  { name: '창문형 에어컨', code: '8415.10.60' },
  { name: '금속 랙', code: '9403.20.0075' },
  { name: '알루미늄 인쇄판', code: '3701.30.00.00' },
  { name: '산업용 로봇', code: '8428.70.00' },
];

const ANNEX_NAME = { 'I-A': '부속서 I-A', 'I-B': '부속서 I-B', 'I-C': '부속서 I-C', II: '부속서 II', III: '부속서 III', IV: '미국산 금속 규칙' };

const state = {
  data: null,
  asOf: todaySeoul(),
  code: null,
  lastJudge: null,
  answers: { metal: 'unknown', equip: 'no', usmetal: '0', auto: 'no' },
  value: 10000,
  descByCode: new Map(),
  verdictVisible: false,
};

function answersForEngine() {
  const a = state.answers;
  return {
    metalWeightPct: a.metal === 'ge15' ? 50 : a.metal === 'lt15' ? 10 : null,
    forEquipment: a.equip === 'yes',
    usMetalPct: Number(a.usmetal) || null,
    isAutoPart: a.auto === 'yes',
  };
}

const regimeFor = (asOf) => pickRegime(state.data.regimes, asOf);
const entriesFor = (asOf) => {
  const r = regimeFor(asOf);
  return r ? state.data.entries[r.id] : [];
};
const descOf = (e) => state.descByCode.get(digits(e.c)) || e.d;
const firstRegime = () => state.data.regimes[0];
const lastRegime = () => state.data.regimes[state.data.regimes.length - 1];
const annexChip = (a) => `<span class="annex">${esc(a)}</span>`;

function shortRate(result) {
  if (!result) return '확인 필요';
  if (result.kind === 'none') return '232조 없음';
  if (result.kind === 'cap') return `합계 ${result.value}%`;
  return `${result.value}%`;
}

function runJudge(code, asOf) {
  return judge({ regimes: state.data.regimes, entriesByRegime: state.data.entries, code, answers: answersForEngine(), asOf });
}

// 판정 결과를 비교용 꼬리표로
const tagOf = (r) => (r.status === 'determined' ? `${r.result.annex}:${shortRate(r.result)}` : r.status);

function sideLabel(r) {
  if (r.status === 'needs-candidate') return '세부 코드에 따라 다름';
  if (r.status === 'no-regime') return '지원 안 함';
  if (r.status !== 'determined') return `${r.status === 'excluded' ? '부속서 II' : '부속서 없음'} · 232조 없음`;
  return `${r.result.annex} · ${shortRate(r.result)}`;
}

// ---------- 머리 ----------
function renderHeader() {
  const r = regimeFor(state.asOf);
  $('regimeText').textContent = r ? `${r.label} 적용` : '4월 6일 이전은 지원 안 함';
}

// ---------- 검색 ----------
function glossaryHits(q) {
  const t = q.replace(/\s+/g, '').toLowerCase();
  if (!t) return [];
  return GLOSSARY.filter((g) => g.words.some((w) => {
    const ww = w.replace(/\s+/g, '').toLowerCase();
    return t.includes(ww) || (t.length >= 2 && ww.includes(t));
  }));
}

function entriesUnderPrefixes(prefixes) {
  const list = entriesFor(state.asOf);
  const out = [];
  const seen = new Set();
  for (const p of prefixes) {
    const pd = digits(p);
    for (const e of list) {
      const ed = digits(e.c);
      if ((ed.startsWith(pd) || pd.startsWith(ed)) && !seen.has(e.a + ed)) {
        seen.add(e.a + ed);
        out.push(e);
      }
    }
  }
  return out.sort((a, b) => digits(a.c).localeCompare(digits(b.c)));
}

function search(q) {
  q = q.trim();
  if (!q) return;
  const d = digits(q);
  if (/^[\d.\s-]+$/.test(q) && d.length >= 4) {
    hideCandidates();
    selectCode(d, true);
    return;
  }
  const hits = glossaryHits(q);
  if (hits.length) {
    const prefixes = hits.flatMap((h) => h.prefixes);
    const list = entriesUnderPrefixes(prefixes);
    const names = hits.map((h) => `${h.label}(${h.prefixes.join(', ')})`).join(', ');
    if (list.length) {
      showCandidates(list, `'${q}'를 ${names}로 찾았습니다. 가장 가까운 줄을 고르세요. 목록에 없는 세부 코드면 232조 금속 관세 대상이 아닙니다.`);
      $('candCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showCandidates([], `'${q}'는 ${names}인데, 이 앞자리로 시작하는 줄이 부속서에 없습니다. 232조 금속 관세 대상이 아닐 가능성이 큽니다.`);
      selectCode(digits(prefixes[0]), true);
    }
    return;
  }
  const t = q.toLowerCase();
  const list = entriesFor(state.asOf).filter((e) => descOf(e).toLowerCase().includes(t)).slice(0, 60);
  if (list.length) showCandidates(list, `영문 품명에 '${q}'가 들어간 줄입니다.`);
  else showCandidates([], `'${q}'는 아직 사전에 없는 제품명입니다. HS코드로 찾아보세요.`);
  $('candCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showCandidates(list, note) {
  $('candCard').hidden = false;
  $('candNote').textContent = note || '';
  $('cands').hidden = list.length === 0;
  $('cands').innerHTML = list.map((e) => `
    <button class="cand" role="listitem" type="button" data-code="${esc(digits(e.c))}" aria-current="${digits(e.c) === state.code}">
      <span class="code">${esc(formatCode(e.c))}</span>
      ${annexChip(e.a)}
      <span class="desc">${esc(descOf(e))}</span>
    </button>`).join('');
}

function hideCandidates() {
  $('candCard').hidden = true;
}

function selectCode(code, scroll) {
  state.code = digits(code);
  renderResult();
  if (!scroll) return;
  const target = $('candCard').hidden ? $('verdict') : $('candCard');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 판정 (어두운 타일) ----------
function verdictCopy(r) {
  const res = r.result;
  if (r.status === 'determined') {
    return {
      rate: `${res.value}%`,
      what: `232조 금속 관세 · ${ANNEX_NAME[res.annex]}`,
      sub: res.kind === 'cap' ? '일반관세와 232조를 합친 최대치입니다.' : '제품 전체 가격에 일반관세와 별도로 붙습니다.',
    };
  }
  const why = r.status === 'excluded' ? '부속서 II(대상 제외)' : r.status === 'excluded-weight' ? '금속 무게 15% 미만' : '부속서 목록에 없음';
  return { rate: res ? `${res.value}%` : '—', what: `232조 금속 관세 없음 · ${why}`, sub: res ? `${res.law}: ${res.text}` : '' };
}

function summaryText(r, code) {
  const res = r.result;
  const lines = ['[관세 부속서 내비 판정 요약]', `품목 코드: ${formatCode(code)}`, `기준일: ${state.asOf} (${r.regime.label})`];
  if (r.status === 'determined') {
    lines.push(`판정: ${ANNEX_NAME[res.annex]}, ${res.kind === 'cap' ? '일반관세 포함 합계 최대 ' : '232조 '}${res.value}% (제품 전체 가격 기준)`);
  } else if (res) {
    lines.push(`판정: 232조 금속 관세 없음. ${res.law} ${res.text}`);
  }
  for (const e of r.basis || []) {
    const src = state.data.sources[e.src];
    lines.push(`근거: ${src ? src.title : ''} ${formatCode(e.c)} "${descOf(e)}"${e.p ? ` (${e.p}쪽)` : ''}`);
    if (src) lines.push(`원문: ${src.url}`);
  }
  lines.push('판정 순서:');
  r.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title}: ${s.detail}`));
  lines.push('참고용 판정이며, 통관 전에 관세사 확인이 필요합니다.');
  return lines.join('\n');
}

function sourceHref(e) {
  const src = state.data.sources[e.src];
  return src ? `${src.url}${e.p ? `#page=${e.p}` : ''}` : null;
}

function renderVerdict(r) {
  const box = $('verdictInner');
  const code = state.code;
  if (!regimeFor(state.asOf)) {
    box.innerHTML = `<p class="verdict-empty">기준일을 2026년 4월 6일 이후로 정하세요.</p><p class="muted verdict-sub">그 전에는 금속 함량 가치에 매기는 이전 방식이라 이 서비스가 다루지 않습니다.</p>`;
    return;
  }
  if (!code) {
    box.innerHTML = `<p class="verdict-empty">품목을 넣으면 여기에 판정이 나옵니다.</p>`;
    return;
  }
  const meta = `<p class="verdict-meta muted num">${esc(formatCode(code))} · ${esc(r.regime.label)} · ${esc(state.asOf)}</p>`;
  if (r.status === 'needs-candidate') {
    const annexes = [...new Set(r.candidates.map((e) => e.a))];
    box.innerHTML = `${meta}<p class="rate">?</p>
      <p class="tagline verdict-what">세부 코드에 따라 갈립니다</p>
      <p class="muted verdict-sub">이 코드 아래 부속서 줄이 ${r.candidates.length}개 있고 ${annexes.map(annexChip).join(' ')}에 나뉘어 있습니다.</p>
      <div class="ctas"><a class="btn btn-primary" href="#candCard" id="toCands">세부 코드 고르기</a></div>`;
    $('toCands').addEventListener('click', (ev) => { ev.preventDefault(); $('candCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    return;
  }
  const v = verdictCopy(r);
  let amount = '';
  if (r.result && state.value > 0) {
    const amt = dutyAmount(r.result, state.value);
    const label = r.result.kind === 'cap' ? '관세 합계 최대' : r.status === 'determined' ? '232조 관세' : r.result.law;
    amount = `<p class="amount">통관가격 ${usd(state.value)}일 때 ${esc(label)} <b>${usd(amt)}</b></p>`;
  }
  const first = (r.basis || [])[0];
  const href = first ? sourceHref(first) : null;
  box.innerHTML = `${meta}
    <p class="rate">${esc(v.rate)}</p>
    <p class="tagline verdict-what">${esc(v.what)}</p>
    <p class="muted verdict-sub">${esc(v.sub)}</p>
    ${amount}
    <div class="ctas">
      <button class="btn btn-primary" type="button" id="copyBtn">근거 문장 복사</button>
      ${href ? `<a class="link-dark" href="${esc(href)}" target="_blank" rel="noopener">부속서 원문 보기 ›</a>` : ''}
    </div>
    <p class="toast" id="toast" role="status"></p>
    <textarea class="copybox" id="copyBox" hidden readonly aria-label="근거 문장"></textarea>`;
  $('copyBtn').addEventListener('click', () => {
    const text = summaryText(r, code);
    const area = $('copyBox');
    const fallback = () => { area.hidden = false; area.value = text; area.focus(); area.select(); $('toast').textContent = '자동 복사가 안 돼서 아래 글을 직접 복사하세요.'; };
    try { navigator.clipboard.writeText(text).then(() => { $('toast').textContent = '근거 문장을 복사했습니다.'; }, fallback); } catch (e) { fallback(); }
  });
}

// ---------- 상세 (밝은 타일) ----------
function depthHtml(inputDigits, matchDigits) {
  const cuts = [[0, 4, '호'], [4, 6, '소호'], [6, 8, '세분'], [8, 10, '통계']];
  return cuts.filter(([a]) => a < inputDigits.length).map(([a, b, label]) => {
    const hit = matchDigits && matchDigits.length >= b;
    return `<span class="seg-code${hit ? ' hit' : ''}"><span>${esc(inputDigits.slice(a, b))}</span><span>${label}</span></span>`;
  }).join('<span class="dot">.</span>');
}

function basisHtml(e) {
  const src = state.data.sources[e.src];
  const href = sourceHref(e);
  return `<div class="basis">
    <div>${annexChip(e.a)} <b class="num">${esc(formatCode(e.c))}</b></div>
    <div class="en">${esc(descOf(e))}</div>
    <div class="meta">${esc(ANNEX_NAME[e.a] || e.a)} · ${esc((e.s || []).join(', '))}${href ? ` · <a href="${esc(href)}" target="_blank" rel="noopener">${esc(src.title)}${e.p ? ` ${e.p}쪽` : ''}</a>` : ''}</div>
  </div>`;
}

function compareCard(code) {
  const before = runJudge(code, firstRegime().from);
  const after = runJudge(code, lastRegime().from);
  const d = diffRegimes(state.data.entries, firstRegime().id, lastRegime().id, code);
  const changed = d.changed || tagOf(before) !== tagOf(after);
  return `<div class="card">
    <h3>4월판과 6월판</h3>
    <div class="change">
      <div class="side"><div class="k">${esc(firstRegime().label)}</div><div class="v">${esc(sideLabel(before))}</div></div>
      <span class="arrow" aria-hidden="true">→</span>
      <div class="side"><div class="k">${esc(lastRegime().label)}</div><div class="v">${esc(sideLabel(after))}</div></div>
    </div>
    <span class="state ${changed ? 'changed' : 'same'}">${changed ? '6월 조정으로 바뀜' : '그대로'}</span>
  </div>`;
}

const stepsHtml = (steps, extra = '') => `<ol class="steps">${steps.map((s) => `<li><span><b>${esc(s.title)}</b>${esc(s.detail)}</span></li>`).join('')}${extra}</ol>`;

function renderDetail(r) {
  const grid = $('detailGrid');
  const code = state.code;
  if (!code || !r || r.status === 'no-regime') { $('detail').hidden = true; return; }
  $('detail').hidden = false;
  if (r.status === 'needs-candidate') {
    grid.innerHTML = `<div class="card"><h3>판정 순서</h3>${stepsHtml(r.steps, '<li><span><b>세부 코드 필요</b>이 코드 아래에서 부속서가 갈려서 세부 코드를 골라야 합니다.</span></li>')}</div>${compareCard(code)}`;
    return;
  }
  const matchDigits = r.basis && r.basis[0] ? digits(r.basis[0].c) : '';
  const basis = `<div class="card"><h3>근거</h3>
    ${matchDigits ? `<p class="help">입력한 코드가 부속서 줄과 어디까지 같은지</p><div class="depth">${depthHtml(code, matchDigits)}</div>` : ''}
    ${(r.basis || []).map(basisHtml).join('') || '<p class="help">부속서에 이 코드로 시작하는 줄이 없습니다.</p>'}
  </div>`;
  const steps = `<div class="card"><h3>판정 순서</h3>${stepsHtml(r.steps)}</div>`;
  const cautions = `<div class="card"><h3>확인할 것</h3>${r.cautions.length ? `<ul class="cautions">${r.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="help">따로 확인할 것이 없습니다.</p>'}</div>`;
  grid.innerHTML = steps + basis + compareCard(code) + cautions;
}

// ---------- 하단 바 ----------
function renderSticky(r) {
  const bar = $('stickyBar');
  const onJudge = !$('judge').hidden;
  if (!onJudge || !state.code || !r || r.status === 'no-regime') { bar.hidden = true; document.body.classList.remove('has-sticky'); return; }
  document.body.classList.add('has-sticky');
  $('stickyKey').textContent = `${formatCode(state.code)} · ${r.regime.label}`;
  if (r.status === 'needs-candidate') {
    $('stickyText').textContent = '세부 코드를 고르면 판정합니다';
  } else {
    const amt = r.result && state.value > 0 ? ` · 관세 ${usd(dutyAmount(r.result, state.value))}` : '';
    $('stickyText').textContent = `${sideLabel(r)}${amt}`;
  }
  bar.hidden = state.verdictVisible;
}

function renderResult() {
  const r = state.code && regimeFor(state.asOf) ? runJudge(state.code, state.asOf) : null;
  if (r && r.status === 'needs-candidate') {
    showCandidates(r.candidates, `${formatCode(state.code)} 아래에서 부속서가 세부 코드마다 갈립니다. 가장 가까운 줄을 고르세요. 목록에 없는 세부 코드면 232조 금속 관세 대상이 아닙니다.`);
  }
  state.lastJudge = r;
  renderVerdict(r);
  renderDetail(r);
  renderSticky(r);
}

// ---------- 알림 ----------
function loadWatch() {
  try { return JSON.parse(localStorage.getItem('navi.watch') || '[]'); } catch (e) { return []; }
}
function saveWatch(list) {
  try { localStorage.setItem('navi.watch', JSON.stringify(list)); } catch (e) { /* 저장이 안 되는 환경 */ }
}

function watchRow(item, isExample, idx) {
  const code = digits(item.code);
  const before = runJudge(code, firstRegime().from);
  const after = runJudge(code, lastRegime().from);
  const d = diffRegimes(state.data.entries, firstRegime().id, lastRegime().id, code);
  const cell = (r) => {
    if (r.status === 'needs-candidate') return '<span class="muted">세부 코드 필요</span>';
    if (r.status !== 'determined') return `${r.status === 'excluded' ? annexChip('II') : annexChip('없음')} 232조 없음`;
    return `${annexChip(r.result.annex)} ${esc(shortRate(r.result))}`;
  };
  const changed = d.changed || tagOf(before) !== tagOf(after);
  return `<tr>
    <td>${esc(item.name)}${isExample ? '<span class="tag-ex">예시</span>' : ''}</td>
    <td class="code"><a href="#" data-open="${esc(code)}">${esc(formatCode(code))}</a></td>
    <td>${cell(before)}</td>
    <td>${cell(after)}</td>
    <td><span class="state ${changed ? 'changed' : 'same'}" style="margin-top: 0">${changed ? '바뀜' : '그대로'}</span></td>
    <td>${isExample ? '' : `<button class="rm" type="button" data-rm="${idx}" aria-label="${esc(item.name)} 삭제">삭제</button>`}</td>
  </tr>`;
}

function renderAlerts() {
  const mine = loadWatch();
  $('watchBody').innerHTML = mine.map((m, i) => watchRow(m, false, i)).join('') + WATCH_EXAMPLES.map((m) => watchRow(m, true)).join('');
}

function renderDiffStats() {
  const [a, b] = [firstRegime().id, lastRegime().id];
  const codes = new Set();
  for (const id of [a, b]) for (const e of state.data.entries[id]) codes.add(digits(e.c));
  const counts = new Map();
  for (const c of codes) {
    const d = diffRegimes(state.data.entries, a, b, c);
    if (!d.changed) continue;
    const key = `${d.before.join('·') || '없음'} → ${d.after.join('·') || '없음'}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((x, y) => y[1] - x[1]);
  $('diffStats').innerHTML = rows.map(([k, n]) => `<span>${esc(k)}</span><span class="n">${n}줄</span>`).join('');
}

// ---------- 소개 ----------
function renderAbout() {
  $('sourceList').innerHTML = Object.values(state.data.sources).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('');
  const n = (id) => state.data.entries[id].length;
  $('builtAt').textContent = `부속서 데이터 수집일 ${state.data.builtAt}. ${firstRegime().label} ${n(firstRegime().id)}줄, ${lastRegime().label} ${n(lastRegime().id)}줄.`;
}

// ---------- 연결 ----------
function showTab(t) {
  for (const u of ['judge', 'alerts', 'about']) {
    $(`tab-${u}`).setAttribute('aria-selected', String(u === t));
    $(u).hidden = u !== t;
  }
  if (t === 'alerts') renderAlerts();
  renderSticky(state.lastJudge);
  window.scrollTo({ top: 0 });
}

function bind() {
  $('asof').value = state.asOf;
  $('asof').addEventListener('change', (ev) => {
    state.asOf = ev.target.value || todaySeoul();
    renderHeader();
    renderResult();
  });
  $('searchForm').addEventListener('submit', (ev) => { ev.preventDefault(); search($('q').value); });
  const ex = $('examples');
  EXAMPLES.forEach((x) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = x.label;
    b.addEventListener('click', () => { $('q').value = x.q || x.code; search(x.q || x.code); });
    ex.appendChild(b);
  });
  $('cands').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.cand');
    if (!btn) return;
    state.code = btn.dataset.code;
    $('cands').querySelectorAll('.cand').forEach((c) => c.setAttribute('aria-current', String(c === btn)));
    renderResult();
    $('verdict').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  for (const name of ['metal', 'equip', 'usmetal', 'auto']) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => el.addEventListener('change', () => { state.answers[name] = el.value; renderResult(); }));
  }
  $('value').addEventListener('input', (ev) => {
    const n = Number(String(ev.target.value).replace(/[^\d.]/g, ''));
    state.value = Number.isFinite(n) ? n : 0;
    renderResult();
  });
  for (const t of ['judge', 'alerts', 'about']) $(`tab-${t}`).addEventListener('click', () => showTab(t));
  $('watchBody').addEventListener('click', (ev) => {
    const open = ev.target.closest('[data-open]');
    if (open) {
      ev.preventDefault();
      $('q').value = formatCode(open.dataset.open);
      hideCandidates();
      showTab('judge');
      selectCode(open.dataset.open, true);
      return;
    }
    const rm = ev.target.closest('[data-rm]');
    if (rm) {
      const list = loadWatch();
      list.splice(Number(rm.dataset.rm), 1);
      saveWatch(list);
      renderAlerts();
    }
  });
  $('addForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('addName').value.trim();
    const code = digits($('addCode').value);
    if (!name || code.length < 4) { $('addMsg').textContent = '품목 이름과 4자리 이상 코드를 넣으세요.'; return; }
    const list = loadWatch();
    list.unshift({ name, code });
    saveWatch(list);
    $('addName').value = '';
    $('addCode').value = '';
    $('addMsg').textContent = `${name}을 등록했습니다. 이 브라우저에만 저장됩니다.`;
    renderAlerts();
  });
  $('stickyBtn').addEventListener('click', (ev) => { ev.preventDefault(); $('verdict').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((items) => {
      state.verdictVisible = items.some((i) => i.isIntersecting);
      renderSticky(state.lastJudge);
    }, { threshold: 0.25 }).observe($('verdict'));
  }
}

async function start() {
  try {
    const res = await fetch('annex-data.json');
    state.data = await res.json();
  } catch (e) {
    $('verdictInner').innerHTML = '<p class="verdict-empty">부속서 데이터를 불러오지 못했습니다. 새로고침해 보세요.</p>';
    return;
  }
  for (const e of state.data.entries[lastRegime().id]) state.descByCode.set(digits(e.c), e.d);
  bind();
  renderHeader();
  renderAbout();
  renderDiffStats();
  // 첫 화면은 예시 품목(볼트)으로 판정해 둔다
  $('q').value = '7318.15.20';
  state.code = digits('7318.15.20');
  renderResult();
}

start();
