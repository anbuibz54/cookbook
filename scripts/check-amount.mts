/**
 * The meal-log amount box. No database.   pnpm check:amount
 */
import { parseAmount } from '../src/lib/amount.ts'

const cases: [string, unknown][] = [
  ['', { kind: 'none' }],
  ['400 g', { kind: 'measured', quantity: 400, unit: 'g' }],
  ['400g', { kind: 'measured', quantity: 400, unit: 'g' }],
  ['2 quả', { kind: 'measured', quantity: 2, unit: 'quả' }],
  ['1,5 kg', { kind: 'measured', quantity: 1.5, unit: 'kg' }],
  ['1/2 bó', { kind: 'measured', quantity: 0.5, unit: 'bó' }],
  ['nửa bó', { kind: 'measured', quantity: 0.5, unit: 'bó' }],
  ['1½ muỗng canh', { kind: 'measured', quantity: 1.5, unit: 'tbsp' }],
  ['½', { kind: 'measured', quantity: 0.5, unit: null }],
  ['3', { kind: 'measured', quantity: 3, unit: null }],
  ['hết', { kind: 'all' }],
  ['Hết', { kind: 'all' }],
  ['một ít', { kind: 'text', text: 'một ít' }],
  ['0 g', { kind: 'text', text: '0 g' }],
]

let failed = 0
for (const [input, want] of cases) {
  const got = parseAmount(input)
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(input)} → ${JSON.stringify(got)}`)
}
if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
