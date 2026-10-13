// 관세 부속서 내비 판정 엔진
// 입력: 품목 코드(HS/HTS), 추가 답변, 기준일
// 출력: 적용 부속서, 세율, 판정 단계, 근거, 주의사항
// 한국산(원산지 한국) 품목만 다룬다.

export const METAL_CHAPTERS = ['72', '73', '74', '76'];

export const digits = (code) => String(code || '').replace(/\D/g, '');

export const formatCode = (code) => {
  const d = digits(code);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  if (d.length <= 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.${d.slice(8)}`;
};

// 기준일에 맞는 규정판 고르기
export function pickRegime(regimes, asOf) {
  const sorted = [...regimes].sort((a, b) => a.from.localeCompare(b.from));
  let found = null;
  for (const r of sorted) if (r.from <= asOf) found = r;
  return found;
}

// 232조 금속 관세가 없는 한국산 품목에 붙는 관세
export function nonMetalTariff(asOf) {
  if (asOf >= '2026-07-24') {
    return {
      kind: 'cap', value: 12.5, law: '301조 강제노동 관세',
      text: '일반관세와 합쳐 12.5%',
      note: '한국은 MFN 구조 12.5%. 한미 FTA 무관세와의 관계는 확인 필요',
      source: 'baker-donelson-301',
    };
  }
  if (asOf >= '2026-02-20') {
    return {
      kind: 'add', value: 10, law: '122조 한시 관세',
      text: '10% 추가',
      note: '2026.2.20~7.23 적용, 7.24부터 301조로 바뀜',
      source: 'gibson-dunn-122',
    };
  }
  return null;
}

// 코드가 부속서 줄과 어떻게 겹치는지
// exact/broader: 입력 코드가 부속서 줄 안에 들어감 → 확정
// narrower: 부속서 줄이 입력보다 자세함 → 후보
export function matchEntries(entries, code) {
  const d = digits(code);
  const covering = [];
  const candidates = [];
  if (d.length < 4) return { covering, candidates };
  for (const e of entries) {
    const ed = digits(e.c);
    if (d.startsWith(ed)) covering.push(e);
    else if (ed.startsWith(d)) candidates.push(e);
  }
  covering.sort((a, b) => digits(b.c).length - digits(a.c).length);
  candidates.sort((a, b) => digits(a.c).localeCompare(digits(b.c)));
  return { covering, candidates };
}

// 부속서 하나에 대한 한국산 세율
function annexRate(regime, annex, ctx) {
  const ch = ctx.chapter;
  switch (annex) {
    case 'I-A':
      return { kind: 'add', value: 50, text: '50% 추가', rule: '부속서 I-A는 제품 전체 가격에 50%' };
    case 'I-B':
      if (regime.features.ibEquipmentPartsCap && ctx.forEquipment && ['84', '85', '87'].includes(ch)) {
        return { kind: 'cap', value: 15, text: '일반관세와 합쳐 최대 15%', rule: 'I-C·III 장비를 만드는 데만 쓰는 84·85·87류 부품은 합계 15% 상한' };
      }
      return { kind: 'add', value: 25, text: '25% 추가', rule: '부속서 I-B는 제품 전체 가격에 25%' };
    case 'I-C':
      return { kind: 'cap', value: 15, text: '일반관세와 합쳐 최대 15%', rule: '부속서 I-C는 기본 25%, 한국 같은 협정 상대국은 합계 15% 상한' };
    case 'III':
      return { kind: 'cap', value: 15, text: '일반관세와 합쳐 최대 15%', rule: '부속서 III은 일반관세와 232조를 합쳐 15% 상한 (2027년 말까지)' };
    case 'II':
      return { kind: 'none', value: 0, text: '232조 금속 관세 없음', rule: '부속서 II는 232조 대상에서 뺀 품목' };
    default:
      return null;
  }
}

// 비교용 총부담(일반관세는 한미 FTA로 0이라고 놓고 비교)
const burden = (r) => (r.kind === 'none' ? 0 : r.value);

export function judge({ regimes, entriesByRegime, code, answers = {}, asOf }) {
  const steps = [];
  const cautions = [];
  const d = digits(code);
  const regime = pickRegime(regimes, asOf);
  if (!regime) return { status: 'no-regime', steps, cautions };
  const entries = entriesByRegime[regime.id] || [];
  const ctx = {
    chapter: d.slice(0, 2),
    forEquipment: !!answers.forEquipment,
    metalWeightPct: answers.metalWeightPct ?? null,
    usMetalPct: answers.usMetalPct ?? null,
  };

  steps.push({ title: '규정판', detail: `${regime.label} 기준으로 판정` });

  const { covering, candidates } = matchEntries(entries, d);

  if (covering.length === 0 && candidates.length > 0) {
    return {
      status: 'needs-candidate', regime, candidates, steps,
      cautions: ['입력한 코드보다 더 자세한 미국 품목번호(HTS)에 따라 부속서가 갈립니다. 아래에서 가장 가까운 줄을 고르세요.'],
    };
  }

  // 부속서에 없음
  if (covering.length === 0) {
    steps.push({ title: '부속서 확인', detail: '어느 부속서에도 없는 코드' });
    const nm = nonMetalTariff(asOf);
    if (nm) steps.push({ title: '다른 관세', detail: `${nm.law}: ${nm.text}` });
    cautions.push('부속서 목록에 없으면 232조 금속 관세는 붙지 않습니다. 단 자동차·부품 등 다른 232조 대상인지는 따로 확인해야 합니다.');
    if (nm?.note) cautions.push(nm.note);
    return { status: 'not-listed', regime, steps, cautions, result: nm ? { ...nm, annex: null } : null, basis: [] };
  }

  // 가장 자세한 줄 기준, 같은 자세함이 여러 부속서에 걸리면 모두 후보
  const topLen = digits(covering[0].c).length;
  const top = covering.filter((e) => digits(e.c).length === topLen);
  const annexSet = [...new Set(top.map((e) => e.a))];
  steps.push({
    title: '부속서 확인',
    detail: `${formatCode(top[0].c)} 줄이 부속서 ${annexSet.join(', ')}에 있음`,
  });

  // 부속서 II는 대상 제외
  if (annexSet.length === 1 && annexSet[0] === 'II') {
    const nm = nonMetalTariff(asOf);
    steps.push({ title: '대상 제외', detail: '부속서 II = 232조 금속 관세 대상에서 빠진 품목' });
    if (nm) steps.push({ title: '다른 관세', detail: `${nm.law}: ${nm.text}` });
    if (nm?.note) cautions.push(nm.note);
    return { status: 'excluded', regime, steps, cautions, result: nm ? { ...nm, annex: 'II' } : null, basis: top };
  }

  // 15% 무게 예외 (72·73·74·76류는 예외 없음)
  const metalChapter = METAL_CHAPTERS.includes(ctx.chapter);
  if (!metalChapter) {
    if (ctx.metalWeightPct != null && ctx.metalWeightPct < 15) {
      const nm = nonMetalTariff(asOf);
      steps.push({ title: '무게 15% 규칙', detail: `금속 무게 ${ctx.metalWeightPct}%로 15% 미만 → 232조 금속 관세 제외` });
      if (nm) steps.push({ title: '다른 관세', detail: `${nm.law}: ${nm.text}` });
      cautions.push('금속 무게 비율은 자재 목록, 사양서, 시험 데이터 같은 증빙으로 증명해야 합니다.');
      if (nm?.note) cautions.push(nm.note);
      return { status: 'excluded-weight', regime, steps, cautions, result: nm ? { ...nm, annex: annexSet[0] } : null, basis: top };
    }
    if (ctx.metalWeightPct == null) {
      cautions.push('72·73·74·76류가 아니므로 금속(강철·알루미늄·구리) 무게가 제품 무게의 15% 미만이면 232조에서 빠집니다. 무게 비율을 넣으면 다시 판정합니다.');
    } else {
      steps.push({ title: '무게 15% 규칙', detail: `금속 무게 ${ctx.metalWeightPct}%로 15% 이상 → 부속서 세율 적용` });
    }
  } else {
    steps.push({ title: '무게 15% 규칙', detail: `${ctx.chapter}류는 무게 예외가 없음` });
  }

  // 부속서별 세율 후보
  const options = [];
  for (const a of annexSet) {
    const r = annexRate(regime, a, ctx);
    if (r) options.push({ ...r, annex: a });
  }
  // 미국산 금속 비율
  if (ctx.usMetalPct != null && ctx.usMetalPct >= regime.usMetalThreshold) {
    options.push({ kind: 'cap', value: 10, text: '최대 10%', rule: `금속의 ${regime.usMetalThreshold}% 이상이 미국산이면 10%`, annex: 'IV' });
  }
  options.sort((a, b) => burden(a) - burden(b));
  const chosen = options[0];
  if (options.length > 1) {
    steps.push({ title: '여러 세율', detail: `${options.map((o) => `${o.annex} ${o.text}`).join(' / ')} 중 가장 낮은 세율 적용` });
  }
  steps.push({ title: '세율', detail: chosen.rule });

  if (answers.isAutoPart) {
    cautions.push('자동차 부품이면 자동차 부품 232조(한국 15%)와의 관계를 따로 확인해야 합니다. 기사 사례(변속기 부품 15%→25%)처럼 금속 부속서가 걸리는 경우가 있습니다.');
  }
  if (chosen.kind === 'add') {
    cautions.push('232조 세율은 일반관세에 더해집니다. 한미 FTA 원산지 기준을 채우면 일반관세는 대부분 0%입니다.');
  }
  if (chosen.kind === 'cap') {
    cautions.push('합계 상한은 미국 일반관세율에 따라 232조 몫이 달라집니다. 정확한 금액은 일반관세율 확인이 필요합니다.');
  }

  return { status: 'determined', regime, steps, cautions, result: chosen, options, basis: top };
}

// 두 규정판 사이에서 바뀐 점
// 한쪽 판에서 코드가 더 자세하게 쪼개져 있으면(표기만 바뀐 경우) 그 세부 줄들의 부속서로 비교한다.
export function diffRegimes(entriesByRegime, fromId, toId, code) {
  const side = (id) => {
    const m = matchEntries(entriesByRegime[id] || [], code);
    if (m.covering.length) {
      const len = digits(m.covering[0].c).length;
      return { annexes: [...new Set(m.covering.filter((e) => digits(e.c).length === len).map((e) => e.a))].sort(), split: false };
    }
    return { annexes: [...new Set(m.candidates.map((e) => e.a))].sort(), split: m.candidates.length > 0 };
  };
  const a = side(fromId);
  const b = side(toId);
  return { before: a.annexes, after: b.annexes, beforeSplit: a.split, afterSplit: b.split, changed: a.annexes.join(',') !== b.annexes.join(',') };
}

// 금액 계산
export function dutyAmount(result, customsValue) {
  if (!result || customsValue == null || isNaN(customsValue)) return null;
  if (result.kind === 'none') return 0;
  if (result.kind === 'add') return (customsValue * result.value) / 100;
  if (result.kind === 'cap') return (customsValue * result.value) / 100; // 상한 기준 최대치
  return null;
}
