// index.html의 <script id="tally-core"> 블록만 꺼내 실행해 계산 로직을 시험한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const core = html.match(/<script id="tally-core">([\s\S]*?)<\/script>/);
assert.ok(core, 'index.html에 tally-core 블록이 있어야 한다');
const ctx = vm.createContext({});
vm.runInContext(core[1], ctx);
// vm 안에서 만든 배열은 원형(prototype)이 달라 deepEqual이 실패하므로 일반 값으로 옮긴다.
const tally = (text) => JSON.parse(JSON.stringify(ctx.tally(text)));

// 응답번호 열 + 문항 1개짜리 붙여넣기 글을 만든다.
function oneQuestion(values) {
  return ['번호\t문항1', ...values.map((v, i) => `${i + 1}\t${v}`)].join('\n');
}

function counts(q) {
  return { valid: q.valid, blank: q.blank, excluded: q.excluded, mean: q.mean };
}

test('사례1: 1, 2, 3, 4, 5', () => {
  const r = tally(oneQuestion(['1', '2', '3', '4', '5']));
  assert.deepEqual(counts(r.questions[0]), { valid: 5, blank: 0, excluded: 0, mean: '3.00' });
});

test('사례2: 5, (빈칸), 3', () => {
  const r = tally(oneQuestion(['5', '', '3']));
  assert.deepEqual(counts(r.questions[0]), { valid: 2, blank: 1, excluded: 0, mean: '4.00' });
});

test('사례3: 4, 6, 0, 4점, 3', () => {
  const r = tally(oneQuestion(['4', '6', '0', '4점', '3']));
  assert.deepEqual(counts(r.questions[0]), { valid: 2, blank: 0, excluded: 3, mean: '3.50' });
});

test('사례4: (빈칸), (빈칸), (빈칸) → 평균 "-"', () => {
  const r = tally(oneQuestion(['', '', '']));
  assert.deepEqual(counts(r.questions[0]), { valid: 0, blank: 3, excluded: 0, mean: '-' });
});

test('규칙: 앞뒤 공백은 지우고 판단, 공백만 있으면 빈 응답, 4.0은 제외', () => {
  const r = tally(oneQuestion([' 4 ', '   ', '4.0']));
  assert.deepEqual(counts(r.questions[0]), { valid: 1, blank: 1, excluded: 1, mean: '4.00' });
});

test('첫 열(응답번호)은 집계하지 않고 문항 이름은 머리글을 따른다', () => {
  const r = tally('번호\t전시 만족\t안내 만족\n1\t5\t4\n2\t3\t2');
  assert.deepEqual(r.questions.map((q) => q.name), ['전시 만족', '안내 만족']);
  assert.equal(r.questions[0].mean, '4.00');
  assert.equal(r.questions[1].mean, '3.00');
});

test('칸이 모자란 줄은 빈 응답, 남는 칸은 무시하고 줄 번호를 알려준다', () => {
  const text = '번호\t문항1\t문항2\n1\t5\n2\t4\t3\t9\n3\t2\t1';
  const r = tally(text);
  assert.deepEqual(counts(r.questions[0]), { valid: 3, blank: 0, excluded: 0, mean: '3.67' });
  assert.deepEqual(counts(r.questions[1]), { valid: 2, blank: 1, excluded: 0, mean: '2.00' });
  assert.deepEqual(r.mismatchedLines, [2, 3]);
});

test('빈 줄(끝의 빈 줄, Windows 줄바꿈 포함)은 응답으로 세지 않는다', () => {
  const r = tally('번호\t문항1\r\n1\t5\r\n\r\n2\t3\r\n\t\r\n');
  assert.equal(r.responseCount, 2);
  assert.deepEqual(counts(r.questions[0]), { valid: 2, blank: 0, excluded: 0, mean: '4.00' });
  assert.deepEqual(r.mismatchedLines, []);
});

test('문항마다 유효 + 빈 응답 + 제외 = 전체 응답 수', () => {
  const text = [
    '번호\tQ1\tQ2\tQ3',
    '1\t5\t\t4점',
    '2\t3',
    '3\t6\t2\t1\t7',
    '4\t \t4.0\t5',
  ].join('\n');
  const r = tally(text);
  assert.equal(r.responseCount, 4);
  for (const q of r.questions) {
    assert.equal(q.valid + q.blank + q.excluded, r.responseCount, q.name);
  }
});

test('평균은 소수 셋째 자리에서 반올림: 3.125 → 3.13', () => {
  const r = tally(oneQuestion(['3', '3', '3', '3', '3', '3', '3', '4']));
  assert.equal(r.questions[0].mean, '3.13');
});

test('평균 반올림에 소수 오차가 없음: 2.675 → 2.68', () => {
  // 합계 107, 유효 40 → 2.675 (일반 소수 계산으로는 2.67로 내림되기 쉬운 값)
  const values = [...Array(13).fill('2'), ...Array(27).fill('3')];
  const r = tally(oneQuestion(values));
  assert.equal(r.questions[0].mean, '2.68');
});
