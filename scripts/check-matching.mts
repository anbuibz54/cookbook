/**
 * Pantry ↔ ingredient name matching (`src/lib/match.ts`).
 *
 *   pnpm check:match
 *
 * The failure this exists for is a FALSE match: the pantry claiming you have
 * something you do not. Each case below is a pair that must or must not match,
 * including the one that shipped once ("sữa tươi không đường" covering "đường").
 */

import assert from 'node:assert/strict'
import { covers, matchKey } from '../src/lib/match.ts'

const cases: [have: string, need: string, expected: boolean, why: string][] = [
  ['trứng gà', 'trứng gà', true, 'same thing'],
  ['Trứng Gà', 'trứng gà', true, 'case and diacritics'],
  ['thịt ba chỉ', 'thịt ba chỉ heo', true, 'recipe adds a qualifier'],
  ['thịt ba chỉ heo', 'thịt ba chỉ', true, 'pantry adds a qualifier'],
  ['thịt ba chỉ thái lát', 'thịt ba chỉ', true, 'prep words are dropped'],
  ['hành lá', 'hành lá', true, 'same thing'],
  ['sữa tươi không đường', 'đường', false, 'milk is not sugar — shared last word'],
  ['sữa tươi không đường', 'đường cát trắng', false, 'milk is not sugar'],
  ['trứng gà', 'trứng vịt', false, 'different eggs'],
  ['nước dừa', 'dừa', false, 'coconut water is not coconut'],
  ['bột mì', 'bột mì số 13', true, 'flour grade is a qualifier'],
  ['bột năng', 'bột mì', false, 'different flours'],
  ['lòng đỏ trứng muối', 'muối', false, 'salted yolk is not salt'],
  // Words that lose meaning without diacritics must not be stripped as noise.
  ['bơ lạt', 'bơ mặn', false, '"lạt" is not "lát" — unsalted is not a slice'],
  ['sữa tươi', 'sữa đặc', false, '"tươi" is part of what the milk is'],
  ['dầu ăn', 'dầu hào', false, 'cooking oil is not oyster sauce'],
  ['rượu nho', 'rượu trắng', false, '"nho" is a grape, not "nhỏ"'],
  ['dầu ăn', 'dầu ăn', true, 'same thing'],
  ['hành tím băm nhuyễn', 'hành tím', true, 'prep words are dropped'],
]

let failures = 0
for (const [have, need, expected, why] of cases) {
  const got = covers(matchKey(have), matchKey(need))
  try {
    assert.equal(got, expected)
    console.log(`✓ ${have} → ${need}: ${got ? 'khớp' : 'không khớp'} (${why})`)
  } catch {
    failures++
    console.error(`✗ ${have} → ${need}: mong ${expected}, ra ${got} (${why})`)
  }
}

if (failures > 0) process.exit(1)
console.log('Tất cả đều đúng.')
