/**
 * Checks `mentionedIn` — what cook mode shows as "nguyên liệu nhắc trong bước
 * này" — against a real recipe's wording.
 *
 *   pnpm check:cook
 *
 * The rule being protected: no WRONG line. A miss is acceptable and two are
 * recorded below as expected; a step listing an ingredient it does not use is
 * the failure this guards against.
 */

import assert from 'node:assert/strict'
import { mentionedIn } from '../src/lib/cook.ts'

const ingredients = [
  'trứng gà', 'bột mì số 8', 'sữa tươi', 'dầu ăn', 'đường cát trắng', 'muối',
  'lòng đỏ trứng muối', 'sốt mayonnaise', 'chà bông gà', 'rượu trắng',
].map((name) => ({ name }))

const cases: { body: string; expect: string[]; note?: string }[] = [
  {
    body: 'Ngâm lòng đỏ trứng muối với rượu trắng 10 phút, nướng ở 160°C rồi cắt đôi.',
    // "muối" alone must NOT appear: the text only says it inside "trứng muối".
    expect: ['lòng đỏ trứng muối', 'rượu trắng'],
  },
  {
    body: 'Đánh lòng đỏ với sữa tươi và dầu ăn cho quyện, rây bột mì vào trộn đều.',
    // "lòng đỏ" here is the fresh yolk, not the salted one.
    expect: ['bột mì số 8', 'sữa tươi', 'dầu ăn'],
  },
  {
    body: 'Đánh lòng trắng với đường đến chóp mềm, chia 3 lần trộn vào hỗn hợp lòng đỏ.',
    expect: [],
    note: 'miss chấp nhận được: công thức viết "đường", nguyên liệu là "đường cát trắng"',
  },
  {
    body: 'Đổ khuôn 20 cm, rải trứng muối lên mặt, nướng ở 150°C.',
    expect: [],
    note: 'miss chấp nhận được: "trứng muối" viết tắt của "lòng đỏ trứng muối"',
  },
  { body: 'Rắc chà bông kín mặt, cắt thành 8 phần.', expect: ['chà bông gà'] },
]

let failures = 0
for (const { body, expect, note } of cases) {
  const got = mentionedIn(body, ingredients).map((i) => i.name)
  try {
    assert.deepEqual(got, expect)
    console.log(`✓ ${got.join(', ') || '(không có)'}${note ? ` — ${note}` : ''}`)
  } catch {
    failures++
    console.error(`✗ ${body}\n  mong: ${expect.join(', ') || '(không có)'}\n  ra:   ${got.join(', ') || '(không có)'}`)
  }
}

if (failures > 0) process.exit(1)
console.log('Tất cả đều đúng.')
