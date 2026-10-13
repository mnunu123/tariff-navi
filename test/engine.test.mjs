import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { judge, diffRegimes } from '../src/engine.js';

const data = JSON.parse(readFileSync(new URL('../data/annex-data.json', import.meta.url), 'utf8'));
const run = (code, asOf, answers = {}) =>
  judge({ regimes: data.regimes, entriesByRegime: data.entries, code, answers, asOf });

const cases = [];
const check = (name, fn) => cases.push([name, fn]);

check('볼트 7318.15.20 지금 = I-A 50%', () => {
  const r = run('7318.15.20', '2026-10-13');
  assert.equal(r.status, 'determined');
  assert.equal(r.result.annex, 'I-A');
  assert.equal(r.result.value, 50);
});

check('4월 6일 이전은 판정 안 함', () => {
  const r = run('7318.15.20', '2026-03-01');
  assert.equal(r.status, 'no-regime');
});

check('농업용 트랙터 변속기 8708.40.30: 4월 I-B 25% → 6월 III 15%', () => {
  const a = run('8708.40.30', '2026-05-01', { metalWeightPct: 80 });
  assert.equal(a.result.annex, 'I-B');
  assert.equal(a.result.value, 25);
  const b = run('8708.40.30', '2026-10-13', { metalWeightPct: 80 });
  assert.equal(b.result.annex, 'III');
  assert.equal(b.result.kind, 'cap');
  assert.equal(b.result.value, 15);
});

check('지게차 8427.10.40: 4월 I-B 25% → 6월 I-C 15%', () => {
  const a = run('8427.10.40', '2026-05-01');
  assert.equal(a.result.annex, 'I-B');
  const b = run('8427.10.40', '2026-10-13');
  assert.equal(b.result.annex, 'I-C');
  assert.equal(b.result.value, 15);
  const d = diffRegimes(data.entries, '2026-04-06', '2026-06-08', '8427.10.40');
  assert.deepEqual(d.before, ['I-B']);
  assert.deepEqual(d.after, ['I-C']);
  assert.ok(d.changed);
});

check('기어 8483.40.10: I-C·III 장비 제조용이면 15%, 아니면 25%', () => {
  const a = run('8483.40.10', '2026-10-13', { metalWeightPct: 90 });
  assert.equal(a.result.value, 25);
  const b = run('8483.40.10', '2026-10-13', { metalWeightPct: 90, forEquipment: true });
  assert.equal(b.result.kind, 'cap');
  assert.equal(b.result.value, 15);
  const c = run('8483.40.10', '2026-05-01', { metalWeightPct: 90, forEquipment: true });
  assert.equal(c.result.value, 25); // 4월판에는 이 상한이 없음
});

check('84류 금속 무게 10%면 232조 제외 → 301조 12.5%', () => {
  const r = run('8427.10.40', '2026-10-13', { metalWeightPct: 10 });
  assert.equal(r.status, 'excluded-weight');
  assert.equal(r.result.value, 12.5);
});

check('73류는 무게 예외 없음', () => {
  const r = run('7318.15.20', '2026-10-13', { metalWeightPct: 5 });
  assert.equal(r.status, 'determined');
  assert.equal(r.result.value, 50);
});

check('6자리 7326.90 입력하면 후보 보여주기', () => {
  const r = run('7326.90', '2026-10-13');
  assert.equal(r.status, 'needs-candidate');
  assert.ok(r.candidates.length > 3);
});

check('가장 자세한 줄 우선: 9403.20.0075는 6월 I-B', () => {
  const r = run('9403.20.0075', '2026-10-13', { metalWeightPct: 70 });
  assert.equal(r.result.annex, 'I-B');
  const old = run('9403.20.0075', '2026-05-01');
  assert.equal(old.status, 'excluded'); // 4월엔 II(9403.20.00)
});

check('부속서에 없는 코드는 not-listed, 122조/301조', () => {
  const r = run('8501.10.20', '2026-10-13');
  assert.equal(r.status, 'not-listed');
  assert.equal(r.result.value, 12.5);
  const r2 = run('8501.10.20', '2026-05-01');
  assert.equal(r2.result.value, 10);
});

check('미국산 금속 90%면 6월판 10%, 4월판(95% 기준)은 그대로', () => {
  const a = run('7318.15.20', '2026-10-13', { usMetalPct: 90 });
  assert.equal(a.result.value, 10);
  const b = run('7318.15.20', '2026-05-01', { usMetalPct: 90 });
  assert.equal(b.result.value, 50);
});

check('표기만 바뀐 코드는 그대로: 7615.10.20', () => {
  const d = diffRegimes(data.entries, '2026-04-06', '2026-06-08', '7615.10.20');
  assert.equal(d.changed, false);
});

check('농업용 트랙터 차체 8708.29.21: I-B → III(세부 코드로 쪼개짐)', () => {
  const d = diffRegimes(data.entries, '2026-04-06', '2026-06-08', '8708.29.21');
  assert.deepEqual(d.before, ['I-B']);
  assert.deepEqual(d.after, ['III']);
});

let fail = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', e.message); }
}
console.log(`${cases.length - fail}/${cases.length} passed`);
process.exit(fail ? 1 : 0);
