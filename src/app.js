// 관세 부속서 내비 화면. engine.js, glossary.js의 함수가 같은 스크립트 안에 먼저 들어온다.
// 첫 화면: 제품 넣기 → (필요하면) 고르기 → 답 → (필요하면) 질문 1~2개.
// 전문 정보는 '자세히 보기' 화면에만 둔다.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todaySeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

const EXAMPLES = [
  { label: '볼트', q: '7318.15.20' },
  { label: '지게차', q: '지게차' },
  { label: '에어컨', q: '에어컨' },
  { label: '굴착기', q: '굴착기' },
  { label: '철제 선반', q: '9403.20.0075' },
];

const WATCH_EXAMPLES = [
  { name: '볼트', code: '7318.15.20' },
  { name: '지게차', code: '8427.10.40' },
  { name: '농업용 트랙터 변속기', code: '8708.40.30' },
  { name: '창문형 에어컨', code: '8415.10.60' },
  { name: '철제 선반', code: '9403.20.0075' },
  { name: '알루미늄 인쇄판', code: '3701.30.00.00' },
  { name: '산업용 로봇', code: '8428.70.00' },
];

const PICK_PAGE = 8;

const state = {
  data: null,
  asOf: todaySeoul(),
  code: null,
  isExample: true,
  answers: { metal: 'unknown', equip: 'no', usmetal: '0' },
  value: 10000,
  koByCode: new Map(),
  enByCode: new Map(),
  picks: [],
  pickShown: PICK_PAGE,
  lastJudge: null,
  answerVisible: false,
  view: 'home',
};

// ---------- 공통 ----------
const regimeFor = (asOf) => pickRegime(state.data.regimes, asOf);
const entriesFor = (asOf) => {
  const r = regimeFor(asOf);
  return r ? state.data.entries[r.id] : [];
};
const firstRegime = () => state.data.regimes[0];
const lastRegime = () => state.data.regimes[state.data.regimes.length - 1];
const koOf = (e) => e.k || state.koByCode.get(digits(e.c)) || enOf(e);
const enOf = (e) => state.enByCode.get(digits(e.c)) || e.d;
const chapterOf = (code) => digits(code).slice(0, 2);

function answersForEngine() {
  const a = state.answers;
  const d = state.code ? digits(state.code) : '';
  return {
    metalWeightPct: a.metal === 'ge15' ? 50 : a.metal === 'lt15' ? 10 : null,
    forEquipment: a.equip === 'yes',
    usMetalPct: Number(a.usmetal) || null,
    isAutoPart: d.startsWith('8708'),
  };
}

function runJudge(code, asOf, answers) {
  return judge({ regimes: state.data.regimes, entriesByRegime: state.data.entries, code, answers: answers || answersForEngine(), asOf });
}

// 비전문가용 짧은 세율 말
function plainRate(r) {
  if (!r || r.status === 'no-regime') return '지원 안 함';
  if (r.status === 'needs-candidate') return '제품마다 달라요';
  if (r.status !== 'determined') return '0%';
  return r.result.kind === 'cap' ? `최대 ${r.result.value}%` : `${r.result.value}%`;
}

function productName(code, r) {
  if (r && r.basis && r.basis[0]) return koOf(r.basis[0]);
  const d = digits(code);
  const g = GLOSSARY.find((x) => x.prefixes.some((p) => d.startsWith(digits(p))));
  return g ? g.label : `HS ${formatCode(code)}`;
}

function changeInfo(code) {
  const before = runJudge(code, firstRegime().from);
  const after = runJudge(code, lastRegime().from);
  const b = plainRate(before);
  const a = plainRate(after);
  return { before, after, b, a, changed: b !== a };
}

const weightRelevant = (r) => r && r.basis && r.basis.length && !METAL_CHAPTERS.includes(chapterOf(state.code))
  && (r.status === 'determined' || r.status === 'excluded-weight') && !r.basis.every((e) => e.a === 'II');
const equipRelevant = (r) => r && r.regime && r.regime.features.ibEquipmentPartsCap && r.basis
  && r.basis.some((e) => e.a === 'I-B') && ['84', '85', '87'].includes(chapterOf(state.code));

// ---------- 머리 ----------
function renderHeader() {
  const r = regimeFor(state.asOf);
  $('regimeText').textContent = r ? `${r.label} 기준 · ${state.asOf}` : '4월 6일 이전은 지원 안 함';
}

// ---------- 검색과 고르기 ----------
function glossaryHits(q) {
  const t = q.replace(/\s+/g, '').toLowerCase();
  if (!t) return [];
  return GLOSSARY.filter((g) => g.words.some((w) => {
    const ww = w.replace(/\s+/g, '').toLowerCase();
    return t.includes(ww) || (t.length >= 2 && ww.includes(t));
  }));
}

function entriesUnderPrefixes(prefixes) {
  const out = [];
  const seen = new Set();
  for (const p of prefixes) {
    const pd = digits(p);
    for (const e of entriesFor(state.asOf)) {
      const ed = digits(e.c);
      if ((ed.startsWith(pd) || pd.startsWith(ed)) && !seen.has(ed)) {
        seen.add(ed);
        out.push(e);
      }
    }
  }
  return out.sort((a, b) => digits(a.c).localeCompare(digits(b.c)));
}

function search(q) {
  q = q.trim();
  if (!q) return;
  state.isExample = false;
  const d = digits(q);
  if (/^[\d.\s-]+$/.test(q) && d.length >= 4) {
    hidePicks();
    setCode(d);
    return;
  }
  const hits = glossaryHits(q);
  let list = [];
  let note = '';
  if (hits.length) {
    list = entriesUnderPrefixes(hits.flatMap((h) => h.prefixes));
    note = `'${q}'(으)로 찾은 제품이에요. 고르면 바로 관세를 알려드려요.`;
    if (!list.length) {
      hidePicks();
      setCode(digits(hits[0].prefixes[0]));
      return;
    }
  } else {
    const t = q.toLowerCase();
    list = entriesFor(state.asOf).filter((e) => koOf(e).toLowerCase().includes(t) || enOf(e).toLowerCase().includes(t)).slice(0, 60);
    note = list.length ? `'${q}'가 들어간 제품이에요.` : '';
  }
  if (list.length === 1) {
    hidePicks();
    setCode(digits(list[0].c));
    return;
  }
  if (!list.length) {
    showPicks([], `'${q}'는 아직 찾을 수 없어요. HS코드로 넣어보시거나 다른 이름으로 찾아보세요.`);
    $('pick').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  showPicks(list, note);
  $('pick').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showPicks(list, note) {
  // 고르는 동안에는 이전 결과를 지우고 '골라주세요'를 보여준다
  state.code = null;
  state.pendingPick = true;
  state.picks = list;
  state.pickShown = PICK_PAGE;
  $('pick').hidden = false;
  $('pickNote').textContent = note;
  renderPicks();
  renderResult();
}

function renderPicks() {
  const shown = state.picks.slice(0, state.pickShown);
  $('picks').innerHTML = shown.map((e) => {
    const r = runJudge(e.c, state.asOf, { metalWeightPct: null, forEquipment: false, usMetalPct: null });
    return `<button class="pick" role="listitem" type="button" data-code="${esc(digits(e.c))}" aria-current="${digits(e.c) === state.code}">
      <span><span class="ko">${esc(koOf(e))}</span><span class="code">HS ${esc(formatCode(e.c))}</span></span>
      <span class="rate-mini">${esc(plainRate(r))}</span>
    </button>`;
  }).join('');
  const rest = state.picks.length - shown.length;
  $('moreWrap').hidden = rest <= 0;
  $('moreBtn').textContent = `${rest}개 더 보기`;
}

function hidePicks() {
  $('pick').hidden = true;
  state.picks = [];
}

function setCode(code, scroll = true) {
  state.code = digits(code);
  state.pendingPick = false;
  state.answers.metal = 'unknown';
  state.answers.equip = 'no';
  syncRadios();
  renderResult();
  if (scroll) {
    const target = state.pendingPick ? $('pick') : $('answer');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function syncRadios() {
  for (const [name, val] of Object.entries(state.answers)) {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (el) el.checked = true;
  }
}

// ---------- 답 ----------
function answerCopy(r) {
  const res = r.result;
  if (r.status === 'determined') {
    if (res.annex === 'IV') return { big: `${res.value}%`, label: '철강 관세(232조), 최대치', say: '미국산 금속을 많이 써서 최대 10%예요.', sub: '금속의 대부분이 미국산이면 낮은 세율을 받아요.' };
    if (res.kind === 'cap') {
      const why = res.annex === 'I-C' ? '한국은 미국과 관세 협정을 맺어서 15%로 줄었어요.'
        : res.annex === 'III' ? '산업기계·농기계 같은 품목은 2027년 말까지 15%로 줄여줘요.'
        : '장비를 만드는 데만 쓰는 부품이라 15%로 줄었어요.';
      return { big: `${res.value}%`, label: '철강 관세(232조) 포함, 최대치', say: `다른 관세까지 모두 합쳐 최대 ${res.value}%예요.`, sub: why };
    }
    const why = res.annex === 'I-A' ? '철·알루미늄·구리로 거의 다 만든 제품에 붙는 가장 높은 세율이에요.' : '금속이 들어간 제품(파생상품)에 붙는 세율이에요.';
    return { big: `${res.value}%`, label: '철강 관세(232조)', say: `제품 가격의 ${res.value}%를 관세로 더 내야 해요.`, sub: why };
  }
  const say = r.status === 'excluded' ? '철강 관세 대상에서 빠진 제품이에요.'
    : r.status === 'excluded-weight' ? '금속이 무게의 15%가 안 돼서 철강 관세가 빠져요.'
    : '철강 관세 목록에 없는 제품이에요.';
  const other = res
    ? (res.kind === 'cap' ? `다만 한국산 제품 대부분에 붙는 다른 관세(${res.law})가 최대 ${res.value}%까지 따로 있어요.` : `다만 이 시기에는 모든 수입품에 붙는 한시 관세 ${res.value}%가 따로 있었어요.`)
    : '';
  return { big: '0%', label: '철강 관세(232조)', say, sub: other };
}

function renderAnswer(r) {
  const box = $('answerInner');
  if (!regimeFor(state.asOf)) {
    box.innerHTML = `<p class="tagline">기준일을 2026년 4월 6일 이후로 정해주세요.</p>`;
    return;
  }
  if (!state.code || !r) {
    if (state.pendingPick && state.picks.length) {
      box.innerHTML = `<p class="display-lg">위에서 제품을 골라주세요</p>
        <p class="muted answer-sub" style="margin-top: 12px">고르면 여기에 관세가 나와요.</p>
        <div class="ctas"><a class="btn btn-primary" href="#pick" id="toPick">제품 고르기</a></div>`;
      $('toPick').addEventListener('click', (ev) => { ev.preventDefault(); $('pick').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    } else {
      box.innerHTML = `<p class="tagline">제품을 넣으면 여기에 관세가 나와요.</p>`;
    }
    return;
  }
  const name = productName(state.code, r);
  const forLine = `<p class="answer-for muted">${state.isExample ? '예시 · ' : ''}${esc(name)} · HS ${esc(formatCode(state.code))}</p>`;
  if (r.status === 'needs-candidate') {
    box.innerHTML = `${forLine}
      <p class="display-lg" style="margin-top: 17px">제품마다 달라요</p>
      <p class="lead answer-say">위에서 가장 가까운 제품을 골라주세요.</p>
      <p class="muted answer-sub">같은 코드 아래에서도 제품에 따라 세율이 달라요.</p>
      <div class="ctas"><a class="btn btn-primary" href="#pick" id="toPick">제품 고르기</a></div>`;
    $('toPick').addEventListener('click', (ev) => { ev.preventDefault(); $('pick').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    return;
  }
  const c = answerCopy(r);
  const ch = changeInfo(state.code);
  let amount = '';
  if (r.result && state.value >= 0) {
    const zero = r.status !== 'determined';
    const amt = zero ? 0 : dutyAmount(r.result, state.value);
    const label = zero ? '철강 관세' : r.result.kind === 'cap' ? '관세 최대' : '관세';
    amount = `<div class="calc"><label for="valueInline">이만큼 보내면</label><span>$</span><input id="valueInline" type="text" inputmode="numeric" value="${state.value.toLocaleString('en-US')}" aria-label="보낼 금액(미국 달러)"><span>→ ${label} <b>${usd(amt)}</b></span></div>`;
  }
  const conditions = [];
  if (weightRelevant(r) && state.answers.metal === 'unknown') conditions.push('금속이 제품 무게의 15%가 안 되면 0%예요. 아래 질문에 답하면 정확해져요.');
  if (equipRelevant(r) && state.answers.equip === 'no' && r.result && r.result.kind === 'add') conditions.push('장비를 만드는 데만 쓰는 부품이면 최대 15%로 줄어요. 아래에서 알려주세요.');
  if (digits(state.code).startsWith('8708')) conditions.push('자동차 부품은 자동차 관세와 겹칠 수 있어요. 자세히 보기에서 확인하세요.');
  box.innerHTML = `${forLine}
    <p class="rate">${esc(c.big)}</p>
    <p class="rate-label muted">${esc(c.label)}</p>
    <p class="lead answer-say">${esc(c.say)}</p>
    <p class="muted answer-sub">${esc(c.sub)}</p>
    ${amount}
    <span class="pillnote">${ch.changed ? `6월 8일부터 바뀌었어요 · ${esc(ch.b)} → ${esc(ch.a)}` : '6월 조정 뒤에도 그대로예요'}</span>
    ${conditions.map((t) => `<p class="condition muted">${esc(t)}</p>`).join('')}
    <div class="ctas"><button class="btn btn-secondary" type="button" id="toDetail">왜 이런 결과인지 자세히 보기</button></div>`;
  const vi = $('valueInline');
  if (vi) {
    vi.addEventListener('change', () => {
      const n = Number(String(vi.value).replace(/[^\d.]/g, ''));
      state.value = Number.isFinite(n) ? n : 0;
      renderResult();
    });
  }
  $('toDetail').addEventListener('click', () => showView('detail'));
}

function renderRefine(r) {
  const w = weightRelevant(r);
  const q = equipRelevant(r);
  $('q-metal-card').hidden = !w;
  $('q-equip-card').hidden = !q;
  $('refine').hidden = !(w || q);
  $('refineTitle').textContent = w && q ? '두 가지만 더 알려주세요' : '한 가지만 더 알려주세요';
}

// ---------- 자세히 보기 ----------
function depthHtml(inputDigits, matchDigits) {
  const cuts = [[0, 4, '앞 4자리'], [4, 6, '5~6자리'], [6, 8, '7~8자리'], [8, 10, '9~10자리']];
  return cuts.filter(([a]) => a < inputDigits.length).map(([a, b, label]) => {
    const hit = matchDigits && matchDigits.length >= b;
    return `<span class="seg-code${hit ? ' hit' : ''}"><span>${esc(inputDigits.slice(a, b))}</span><span>${label}</span></span>`;
  }).join('<span class="dot">.</span>');
}

function sourceHref(e) {
  const src = state.data.sources[e.src];
  return src ? `${src.url}${e.p ? `#page=${e.p}` : ''}` : null;
}

function basisHtml(e) {
  const src = state.data.sources[e.src];
  const href = sourceHref(e);
  return `<div class="basis">
    <div><span class="annex">${esc(e.a)}</span> <span class="ko">${esc(koOf(e))}</span></div>
    <div class="en">HS ${esc(formatCode(e.c))} · ${esc(enOf(e))}</div>
    <div class="meta">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(src.title)}${e.p ? ` ${e.p}쪽` : ''}</a>` : ''}</div>
  </div>`;
}

function summaryText(r) {
  const code = state.code;
  const lines = ['[관세 부속서 내비 판정 요약]', `제품: ${productName(code, r)} (HS ${formatCode(code)})`, `기준일: ${state.asOf} (${r.regime.label})`, `결과: 철강 관세(232조) ${plainRate(r)}`];
  for (const e of r.basis || []) {
    const src = state.data.sources[e.src];
    lines.push(`근거: ${src ? src.title : ''} 부속서 ${e.a}, ${formatCode(e.c)} "${enOf(e)}"${e.p ? ` (${e.p}쪽)` : ''}`);
    if (src) lines.push(`원문: ${src.url}`);
  }
  lines.push('판정 순서:');
  r.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title}: ${s.detail}`));
  lines.push('참고용 판정이며, 통관 전에 관세사 확인이 필요합니다.');
  return lines.join('\n');
}

function renderDetail() {
  const r = state.lastJudge;
  const grid = $('detailGrid');
  if (!r || !state.code) {
    $('detailTitle').textContent = '먼저 제품을 넣어주세요';
    $('detailLead').textContent = '';
    grid.innerHTML = '';
    return;
  }
  const name = productName(state.code, r);
  $('detailTitle').textContent = r.status === 'needs-candidate' ? '세부 제품을 먼저 골라주세요' : `왜 ${plainRate(r)}인가요?`;
  $('detailLead').textContent = `${name} · HS ${formatCode(state.code)} · ${r.regime.label} 기준`;
  const ch = changeInfo(state.code);
  const steps = `<div class="card"><h3>이렇게 판정했어요</h3><ol class="steps">${r.steps.map((s) => `<li><span><b>${esc(s.title)}</b> ${esc(s.detail)}</span></li>`).join('')}</ol></div>`;
  const matchDigits = r.basis && r.basis[0] ? digits(r.basis[0].c) : '';
  const basis = `<div class="card"><h3>미국 정부 문서의 근거</h3>
    ${matchDigits ? `<p class="help">넣은 코드가 미국 목록의 어느 줄과 몇 자리까지 같은지</p><div class="depth">${depthHtml(state.code, matchDigits)}</div>` : ''}
    ${(r.basis || []).map(basisHtml).join('') || '<p class="help">미국 목록에 이 코드로 시작하는 줄이 없어요.</p>'}
  </div>`;
  const compare = `<div class="card"><h3>6월 조정 전후</h3>
    <div class="change">
      <div class="side"><div class="k">${esc(firstRegime().label)} (4월 6일~)</div><div class="v">${esc(ch.b)}</div></div>
      <span class="arrow" aria-hidden="true">→</span>
      <div class="side"><div class="k">${esc(lastRegime().label)} (6월 8일~)</div><div class="v">${esc(ch.a)}</div></div>
    </div>
    <p style="margin-top: 12px"><span class="state ${ch.changed ? 'changed' : 'same'}">${ch.changed ? '바뀜' : '그대로'}</span></p>
  </div>`;
  const cautions = `<div class="card"><h3>확인할 것</h3>${r.cautions.length ? `<ul class="cautions">${r.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="help">따로 확인할 것이 없어요.</p>'}</div>`;
  const special = `<div class="card"><h3>특수한 경우</h3>
    <p class="help">들어간 금속 중 미국산 비율 (4월판은 95% 이상, 6월판은 85% 이상이면 10%)</p>
    <div class="opts" role="radiogroup" aria-label="미국산 금속 비율">
      <label><input type="radio" name="usmetal" value="0" ${state.answers.usmetal === '0' ? 'checked' : ''}><span>85% 미만</span></label>
      <label><input type="radio" name="usmetal" value="90" ${state.answers.usmetal === '90' ? 'checked' : ''}><span>85~94%</span></label>
      <label><input type="radio" name="usmetal" value="100" ${state.answers.usmetal === '100' ? 'checked' : ''}><span>95% 이상</span></label>
    </div>
    <p class="help" style="margin-top: 16px">다른 날짜 기준으로 보기</p>
    <div class="date-row"><input type="date" id="asof" min="2026-04-06" value="${esc(state.asOf)}" aria-label="기준일"></div>
  </div>`;
  const copy = `<div class="card"><h3>근거 문장</h3><p class="help">바이어나 관세사에게 그대로 보낼 수 있는 요약이에요.</p>
    <div class="ctas" style="justify-content: flex-start; margin-top: 16px"><button class="btn btn-primary" type="button" id="copyBtn">근거 문장 복사</button></div>
    <p class="toast" id="toast" role="status"></p>
    <textarea class="copybox" id="copyBox" hidden readonly aria-label="근거 문장"></textarea></div>`;
  grid.innerHTML = r.status === 'needs-candidate' ? steps + compare : steps + basis + compare + cautions + special + copy;
  grid.querySelectorAll('input[name="usmetal"]').forEach((el) => el.addEventListener('change', () => { state.answers.usmetal = el.value; renderResult(); renderDetail(); }));
  const asof = $('asof');
  if (asof) asof.addEventListener('change', () => { state.asOf = asof.value || todaySeoul(); renderHeader(); renderResult(); renderDetail(); });
  const btn = $('copyBtn');
  if (btn) btn.addEventListener('click', () => {
    const text = summaryText(r);
    const area = $('copyBox');
    const fallback = () => { area.hidden = false; area.value = text; area.focus(); area.select(); $('toast').textContent = '자동 복사가 안 돼서 아래 글을 직접 복사해 주세요.'; };
    try { navigator.clipboard.writeText(text).then(() => { $('toast').textContent = '근거 문장을 복사했어요.'; }, fallback); } catch (e) { fallback(); }
  });
}

// ---------- 하단 바 ----------
function renderSticky() {
  const r = state.lastJudge;
  const bar = $('stickyBar');
  if (state.view !== 'home' || !state.code || !r || r.status === 'no-regime') { bar.hidden = true; document.body.classList.remove('has-sticky'); return; }
  document.body.classList.add('has-sticky');
  $('stickyText').textContent = `${productName(state.code, r)} · ${plainRate(r)}`;
  bar.hidden = state.answerVisible;
}

function renderResult() {
  const r = state.code && regimeFor(state.asOf) ? runJudge(state.code, state.asOf) : null;
  state.lastJudge = r;
  if (r && r.status === 'needs-candidate') {
    // 코드만으로 정할 수 없으면 세부 제품 고르기로 넘긴다
    showPicks(r.candidates, `HS ${formatCode(state.code)} 아래 제품이에요. 고르면 바로 관세를 알려드려요.`);
    return;
  }
  if (!$('pick').hidden) renderPicks();
  renderAnswer(r);
  renderRefine(r);
  renderSticky();
}

// ---------- 내 품목 알림 ----------
function loadWatch() {
  try { return JSON.parse(localStorage.getItem('navi.watch') || '[]'); } catch (e) { return []; }
}
function saveWatch(list) {
  try { localStorage.setItem('navi.watch', JSON.stringify(list)); } catch (e) { /* 저장이 안 되는 환경 */ }
}

function itemHtml(item, isExample, idx) {
  const code = digits(item.code);
  const none = { metalWeightPct: null, forEquipment: false, usMetalPct: null };
  const before = plainRate(runJudge(code, firstRegime().from, none));
  const after = plainRate(runJudge(code, lastRegime().from, none));
  const changed = before !== after;
  return { changed, html: `<div class="item">
    <div>
      <div class="ko">${esc(item.name)}${isExample ? '<span class="tag-ex">예시</span>' : ''}</div>
      <div class="code">HS ${esc(formatCode(code))}</div>
      <div class="actions"><button class="linkbtn" type="button" data-open="${esc(code)}">관세 확인</button>${isExample ? '' : `<button class="linkbtn" type="button" data-rm="${idx}">삭제</button>`}</div>
    </div>
    <div class="right">
      <span class="move">${changed ? `${esc(before)} → ${esc(after)}` : esc(after)}</span>
      <span class="state ${changed ? 'changed' : 'same'}">${changed ? '6월 8일부터 바뀜' : '그대로'}</span>
    </div>
  </div>` };
}

function renderAlerts() {
  const mine = loadWatch().map((m, i) => itemHtml(m, false, i));
  const ex = WATCH_EXAMPLES.map((m) => itemHtml(m, true));
  const all = [...mine, ...ex];
  const order = [...mine, ...ex.filter((x) => x.changed), ...ex.filter((x) => !x.changed)];
  $('items').innerHTML = order.map((x) => x.html).join('');
  const n = all.filter((x) => x.changed).length;
  $('alertsLead').textContent = `품목 ${all.length}개 중 ${n}개가 6월 8일 조정으로 바뀌었어요.`;
}

// ---------- 소개 ----------
function renderAbout() {
  $('sourceList').innerHTML = Object.values(state.data.sources).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('');
  const n = (id) => state.data.entries[id].length;
  $('builtAt').textContent = `데이터 수집일 ${state.data.builtAt}. ${firstRegime().label} ${n(firstRegime().id)}줄, ${lastRegime().label} ${n(lastRegime().id)}줄. 한국어 품명은 영문 품명을 옮긴 것이라 원문이 기준입니다.`;
}

// ---------- 화면 전환 ----------
function showView(v) {
  state.view = v;
  $('home').hidden = v !== 'home';
  $('detailView').hidden = v !== 'detail';
  $('alerts').hidden = v !== 'alerts';
  $('about').hidden = v !== 'about';
  $('tab-home').setAttribute('aria-selected', String(v === 'home' || v === 'detail'));
  $('tab-alerts').setAttribute('aria-selected', String(v === 'alerts'));
  if (v === 'detail') renderDetail();
  if (v === 'alerts') renderAlerts();
  renderSticky();
  window.scrollTo({ top: 0 });
}

function bind() {
  $('searchForm').addEventListener('submit', (ev) => { ev.preventDefault(); search($('q').value); });
  EXAMPLES.forEach((x) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = x.label;
    b.addEventListener('click', () => { $('q').value = x.q; search(x.q); });
    $('examples').appendChild(b);
  });
  $('picks').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.pick');
    if (!btn) return;
    state.isExample = false;
    setCode(btn.dataset.code, false);
    $('answer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('moreBtn').addEventListener('click', () => { state.pickShown += PICK_PAGE; renderPicks(); });
  for (const name of ['metal', 'equip']) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => el.addEventListener('change', () => { state.answers[name] = el.value; renderResult(); }));
  }
  $('tab-home').addEventListener('click', () => showView('home'));
  $('homeLink').addEventListener('click', () => showView('home'));
  $('tab-alerts').addEventListener('click', () => showView('alerts'));
  $('aboutLink').addEventListener('click', (ev) => { ev.preventDefault(); showView('about'); });
  $('backBtn').addEventListener('click', () => { showView('home'); $('answer').scrollIntoView({ block: 'start' }); });
  $('items').addEventListener('click', (ev) => {
    const open = ev.target.closest('[data-open]');
    if (open) {
      $('q').value = formatCode(open.dataset.open);
      state.isExample = false;
      hidePicks();
      showView('home');
      setCode(open.dataset.open);
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
    if (!name || code.length < 4) { $('addMsg').textContent = '품목 이름과 4자리 이상 HS코드를 넣어주세요.'; return; }
    const list = loadWatch();
    list.unshift({ name, code });
    saveWatch(list);
    $('addName').value = '';
    $('addCode').value = '';
    $('addMsg').textContent = `${name}을(를) 등록했어요. 이 브라우저에만 저장돼요.`;
    renderAlerts();
  });
  $('stickyBtn').addEventListener('click', (ev) => { ev.preventDefault(); $('answer').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((items) => {
      state.answerVisible = items.some((i) => i.isIntersecting);
      renderSticky();
    }, { threshold: 0.25 }).observe($('answer'));
  }
}

async function start() {
  try {
    const res = await fetch('annex-data.json');
    state.data = await res.json();
  } catch (e) {
    $('answerInner').innerHTML = '<p class="tagline">데이터를 불러오지 못했어요. 새로고침해 주세요.</p>';
    return;
  }
  for (const id of state.data.regimes.map((r) => r.id)) {
    for (const e of state.data.entries[id]) {
      if (e.k) state.koByCode.set(digits(e.c), e.k);
      state.enByCode.set(digits(e.c), e.d); // 나중 판(6월)이 덮어씀
    }
  }
  bind();
  renderHeader();
  renderAbout();
  // 첫 화면은 예시(볼트) 결과를 보여준다
  state.code = digits('7318.15.20');
  state.isExample = true;
  renderResult();
}

start();
