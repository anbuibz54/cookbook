import { clearBoughtAction, setBoughtAction } from '@/app/_actions/kitchen'
import { ShoppingAddForm, ShoppingLineRow, type StoreChoice } from './shopping-editor'
import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { formatQuantity } from '@/lib/units'
import { db } from '@/server/db'
import { listShopping, listStores, STORE_KINDS, STORE_LABEL, type ShoppingLine } from '@/server/shopping/service'

const KIND_STYLE: Record<string, string> = {
  bhx: 'bg-protein text-white',
  cho: 'bg-primary text-white',
  sieu_thi: 'bg-carbs',
  online: 'bg-surface',
}

type Group = {
  key: string
  title: string
  kind: string | null
  address: string | null
  mapsUrl: string | null
  lines: ShoppingLine[]
}

/**
 * "Bách Hóa Xanh Nguyễn Thị Thập" already says Bách Hóa Xanh; "chợ Tân Mỹ"
 * already says chợ. Prefix the kind only when the branch name does not.
 */
function storeTitle(kind: keyof typeof STORE_LABEL, name: string) {
  const label = STORE_LABEL[kind]
  const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  return plain(name).includes(plain(label)) ? name : `${label} · ${name}`
}

/** One group per shop, in shopping order: chain, market, supermarket, online, then unsorted. */
function groupByStore(lines: ShoppingLine[]): Group[] {
  const groups = new Map<string, Group>()

  for (const line of lines) {
    const key = line.store?.id ?? 'unsorted'
    const group = groups.get(key) ?? {
      key,
      title: line.store ? storeTitle(line.store.kind, line.store.name) : 'Chưa phân loại',
      kind: line.store?.kind ?? null,
      address: line.store?.address ?? null,
      mapsUrl: line.store?.mapsUrl ?? null,
      lines: [],
    }
    group.lines.push(line)
    groups.set(key, group)
  }

  const order = (kind: string | null) => (kind == null ? STORE_KINDS.length : STORE_KINDS.indexOf(kind as never))
  return [...groups.values()].sort((a, b) => order(a.kind) - order(b.kind))
}

export default async function ShoppingPage() {
  const { user } = await requireUser()
  const [lines, stores] = await Promise.all([listShopping(db, user.id), listStores(db, user.id)])
  // Real branches first (from Claude or earlier picks), then a plain kind for
  // each kind that has no store yet.
  const choices: StoreChoice[] = [
    ...[...stores]
      .sort((a, b) => STORE_KINDS.indexOf(a.kind) - STORE_KINDS.indexOf(b.kind))
      .map((st) => ({ value: `store:${st.id}`, label: storeTitle(st.kind, st.name) })),
    ...STORE_KINDS.filter((kind) => !stores.some((st) => st.kind === kind && st.name === STORE_LABEL[kind])).map(
      (kind) => ({ value: `kind:${kind}`, label: STORE_LABEL[kind] }),
    ),
  ]
  const open = lines.filter((l) => l.boughtAt == null)
  const bought = lines.filter((l) => l.boughtAt != null)
  const groups = groupByStore(open)
  const unsorted = open.filter((l) => l.store == null).length

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[18px] pt-6 pb-32">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-[30px] leading-none font-extrabold">Đi chợ</h1>
          <span className="font-mono text-sm text-muted">
            {open.length} món{bought.length > 0 ? ` · ${bought.length} đã mua` : ''}
          </span>
        </header>

        <ShoppingAddForm choices={choices} />

        {open.length === 0 && bought.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-line px-5 py-8 text-center text-pretty text-muted">
            Danh sách trống. Bấm “Thêm món cần mua”, vào Tủ lạnh bấm “thêm món thiếu vào đi chợ”, hoặc nói
            với Claude “thêm trứng với sữa vào danh sách đi chợ”.
          </p>
        ) : null}

        {unsorted > 0 ? (
          <p className="rounded-[18px] border-2 border-ink bg-warn-bg px-4 py-3 text-[13px] text-pretty text-warn-ink">
            {unsorted} món chưa biết mua ở đâu. Chạm vào món để tự chọn chỗ mua, hoặc nói với Claude “phân
            loại danh sách đi chợ, tui ở [quận/khu vực]” để Claude tra và gửi kèm địa chỉ, link bản đồ.
          </p>
        ) : null}

        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded-full border-2 border-ink px-3 py-1 font-display text-[15px] font-extrabold ${
                  group.kind ? KIND_STYLE[group.kind] : 'bg-surface'
                }`}
              >
                {group.title}
              </span>
              {group.mapsUrl ? (
                <a
                  href={group.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[13px] text-primary underline underline-offset-4"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  Bản đồ
                </a>
              ) : null}
            </div>
            {group.address ? <p className="text-xs text-muted">{group.address}</p> : null}

            <ul className="rounded-[18px] border border-line bg-surface px-3.5">
              {group.lines.map((line, i) => (
                <ShoppingLineRow
                  key={`${line.id}:${line.quantity}:${line.unit}:${line.storeId}`}
                  first={i === 0}
                  choices={choices}
                  line={{
                    id: line.id,
                    name: line.name,
                    amount:
                      line.quantity != null ? `${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ''}` : '',
                    detail: [line.note, line.recipeTitle ? `cho ${line.recipeTitle}` : null].filter(Boolean).join(' · ') || null,
                    note: line.note,
                    storeValue: line.storeId ? `store:${line.storeId}` : '',
                  }}
                />
              ))}
            </ul>
          </section>
        ))}

        {bought.length > 0 ? (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold text-muted">Đã mua</h2>
              <form action={clearBoughtAction}>
                <button type="submit" className="text-[13px] text-muted hover:text-primary">
                  Xóa hết
                </button>
              </form>
            </div>
            <ul className="rounded-[18px] border border-line px-3.5">
              {bought.map((line, i) => (
                <li
                  key={line.id}
                  className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-line-soft' : ''}`}
                >
                  <form action={setBoughtAction.bind(null, line.id, false)} className="flex">
                    <button
                      type="submit"
                      aria-label={`Bỏ đánh dấu đã mua ${line.name}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-muted bg-muted"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    </button>
                  </form>
                  <span className="truncate text-muted line-through">{line.name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PageTransition>
  )
}
