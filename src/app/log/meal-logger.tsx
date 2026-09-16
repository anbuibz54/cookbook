'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { proposeMealAction, saveMealAction } from '@/app/_actions/journal'
import { parseAmount } from '@/lib/amount'
import { shrinkPhoto } from '@/lib/photo'
import { normalizeForSearch } from '@/lib/text'

type RecipeChoice = { id: string; title: string; searchText: string }
type PantryChoice = { id: string; name: string; have: string }
type Dish = { recipeId: string | null; name: string }
type UseRow = { pantryItemId: string; name: string; have: string; amount: string; forDish: string; ticked: boolean }
type BuyRow = { key: string; name: string; amount: string; forDish: string; ticked: boolean }

const keyOf = (name: string) => normalizeForSearch(name)

/**
 * The meal log. Pick the dishes; the app proposes what came out of the fridge
 * and what was bought (recipe × pantry, on the server); the cook ticks and
 * corrects; saving updates the pantry.
 *
 * Re-proposing when the dish list changes keeps whatever the cook already
 * touched: a row that exists keeps its tick and amount, only new rows come in
 * with the proposal's defaults.
 */
export function MealLogger({
  today,
  recipes,
  pantry,
  initialDish,
  backHref,
}: {
  today: string
  recipes: RecipeChoice[]
  pantry: PantryChoice[]
  initialDish: Dish | null
  backHref: string
}) {
  const [dishes, setDishes] = useState<Dish[]>(initialDish ? [initialDish] : [])
  const [query, setQuery] = useState('')
  const [used, setUsed] = useState<UseRow[]>([])
  const [bought, setBought] = useState<BuyRow[]>([])
  const [cookedOn, setCookedOn] = useState(today)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [newBuy, setNewBuy] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [proposing, startProposing] = useTransition()
  const [saving, startSaving] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const recipeIds = useMemo(
    () => dishes.map((d) => d.recipeId).filter((id): id is string => Boolean(id)),
    [dishes],
  )
  const recipeKey = recipeIds.join(',')

  // Recipe × pantry, whenever the set of recipes changes.
  useEffect(() => {
    const ids = recipeKey ? recipeKey.split(',') : []
    startProposing(async () => {
      const proposal = ids.length ? await proposeMealAction(ids) : { used: [], bought: [] }
      setUsed((rows) => {
        const manual = rows.filter((r) => !r.forDish)
        const next = proposal.used.map((p) => rows.find((r) => r.pantryItemId === p.pantryItemId) ?? p)
        return [...next, ...manual.filter((m) => !next.some((n) => n.pantryItemId === m.pantryItemId))]
      })
      setBought((rows) => {
        const manual = rows.filter((r) => !r.forDish)
        const next = proposal.bought.map(
          (p) => rows.find((r) => r.key === keyOf(p.name)) ?? { ...p, key: keyOf(p.name), ticked: true },
        )
        return [...next, ...manual.filter((m) => !next.some((n) => n.key === m.key))]
      })
    })
  }, [recipeKey])

  // Free the preview's object URL when it is replaced or the screen closes.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])

  const matches = useMemo(() => {
    const q = normalizeForSearch(query)
    if (!q) return []
    return recipes
      .filter((r) => !recipeIds.includes(r.id))
      .filter((r) => normalizeForSearch(r.title).includes(q) || r.searchText.includes(q))
      .slice(0, 5)
  }, [query, recipes, recipeIds])

  function addDish(dish: Dish) {
    if (dishes.some((d) => (dish.recipeId ? d.recipeId === dish.recipeId : keyOf(d.name) === keyOf(dish.name)))) {
      setQuery('')
      return
    }
    setDishes((list) => [...list, dish])
    setQuery('')
  }

  function addTyped() {
    const text = query.trim()
    if (!text) return
    const exact = recipes.find((r) => keyOf(r.title) === keyOf(text))
    addDish(exact ? { recipeId: exact.id, name: exact.title } : { recipeId: null, name: text })
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    setError(null)
    try {
      const blob = await shrinkPhoto(file)
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch {
      setError('Không đọc được ảnh này. Thử ảnh khác nhé.')
    } finally {
      setPhotoBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function save() {
    setError(null)
    if (dishes.length === 0) {
      setError('Nấu món gì vậy? Thêm ít nhất một món.')
      return
    }
    const form = new FormData()
    form.set(
      'payload',
      JSON.stringify({
        cookedOn,
        dishes,
        note: note.trim() || null,
        used: used.filter((r) => r.ticked).map((r) => ({ pantryItemId: r.pantryItemId, amount: r.amount })),
        bought: bought.filter((r) => r.ticked).map((r) => ({ name: r.name, amount: r.amount })),
      }),
    )
    if (photo) form.set('photo', photo.blob, 'meal.jpg')

    startSaving(async () => {
      // On success the action redirects and this never returns.
      const result = await saveMealAction(form)
      if (result?.error) setError(result.error)
    })
  }

  const unlisted = pantry.filter((p) => !used.some((u) => u.pantryItemId === p.id))

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-3 pb-10">
      <header className="grid h-13 grid-cols-[64px_minmax(0,1fr)_64px] items-center">
        <Link href={backHref} transitionTypes={['nav-back']} className="py-3 text-muted hover:text-ink">
          Hủy
        </Link>
        <h1 className="text-center font-display text-xl font-extrabold">Ghi bữa</h1>
      </header>

      {/* Photo */}
      <input
        ref={fileInput}
        id="meal-photo"
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => pickPhoto(e.target.files?.[0])}
      />
      {photo ? (
        <div className="relative h-[240px] overflow-hidden rounded-[20px] border-2 border-ink bg-line-soft">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing to optimise */}
          <img src={photo.url} alt="Ảnh bữa ăn" className="size-full object-cover" />
          <div className="absolute inset-x-3 bottom-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="h-9 rounded-full bg-surface/90 px-3 text-[13px] font-medium"
            >
              Bỏ ảnh
            </button>
            <label
              htmlFor="meal-photo"
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-surface/90 px-3 text-[13px] font-medium"
            >
              <CameraIcon size={15} />
              Chụp lại
            </label>
          </div>
        </div>
      ) : (
        <label
          htmlFor="meal-photo"
          className="flex h-[150px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-line bg-surface text-muted hover:border-ink hover:text-ink"
        >
          <CameraIcon size={28} />
          <span className="text-sm">{photoBusy ? 'Đang xử lý ảnh…' : 'Chụp hoặc chọn ảnh (không bắt buộc)'}</span>
        </label>
      )}

      {/* Dishes */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="meal-dish" className="text-[13px] font-medium">
            Nấu gì?
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            Ngày
            <input
              type="date"
              value={cookedOn}
              max={today}
              onChange={(e) => setCookedOn(e.target.value || today)}
              className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-[13px] text-ink"
            />
          </label>
        </div>

        {dishes.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {dishes.map((dish) => (
              <li
                key={dish.recipeId ?? dish.name}
                className={`flex h-8 items-center gap-1.5 rounded-full pl-2.5 text-[13px] ${
                  dish.recipeId ? 'border border-ink bg-surface' : 'bg-warn-bg text-warn-ink'
                }`}
              >
                {dish.recipeId ? <CheckIcon className="text-protein" /> : null}
                <span>
                  {dish.name}
                  <span className="text-muted"> · {dish.recipeId ? 'trong sổ' : 'không có công thức'}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Bỏ ${dish.name}`}
                  onClick={() => setDishes((list) => list.filter((d) => d !== dish))}
                  className="flex size-8 items-center justify-center rounded-full text-muted hover:text-primary"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex h-[50px] items-center gap-2 rounded-[14px] border-2 border-ink bg-surface pr-1.5 pl-3.5">
          <input
            id="meal-dish"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTyped()
              }
            }}
            placeholder={dishes.length ? 'Thêm món khác' : 'canh chua, gà kho…'}
            autoComplete="off"
            enterKeyHint="done"
            className="min-w-0 grow bg-transparent text-base outline-none placeholder:text-placeholder"
          />
          {query.trim() ? (
            <button type="button" onClick={addTyped} className="h-9 rounded-full bg-ink px-3.5 text-sm text-background">
              Thêm
            </button>
          ) : null}
        </div>

        {matches.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {matches.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => addDish({ recipeId: r.id, name: r.title })}
                  className="h-8 rounded-full border border-line bg-surface px-3 text-[13px] hover:border-ink"
                >
                  + {r.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {dishes.length > 0 ? (
        <>
          {/* Used from the pantry */}
          <section
            aria-busy={proposing}
            className="flex flex-col rounded-[18px] border border-line bg-surface px-4 pt-3.5 pb-3"
          >
            <div className="flex items-center justify-between pb-1.5">
              <h2 className="font-display text-lg font-bold">Đã dùng từ tủ lạnh</h2>
              {proposing ? <span className="text-xs text-muted">đang đối chiếu…</span> : null}
            </div>

            {used.length === 0 ? (
              <p className="py-2 text-sm text-pretty text-muted">
                {recipeIds.length
                  ? 'Tủ lạnh không có gì trong công thức này.'
                  : 'Món không có công thức, thêm tay từ tủ bên dưới nếu có dùng.'}
              </p>
            ) : (
              <ul>
                {used.map((row, i) => (
                  <li
                    key={row.pantryItemId}
                    className={`grid min-h-13 grid-cols-[28px_minmax(0,1fr)_104px] items-center gap-2.5 py-1.5 ${
                      i > 0 ? 'border-t border-line-soft' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.ticked}
                      aria-label={`Đã dùng ${row.name}`}
                      onChange={(e) =>
                        setUsed((rows) =>
                          rows.map((r) => (r === row ? { ...r, ticked: e.target.checked } : r)),
                        )
                      }
                      className="size-5 accent-[var(--ink)]"
                    />
                    <div className={`flex min-w-0 flex-col ${row.ticked ? '' : 'text-muted'}`}>
                      <span className="truncate">{row.name}</span>
                      <span className="truncate text-[11px] text-muted">
                        {[row.have && `tủ còn ${row.have}`, row.forDish && `cho ${row.forDish}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <AmountBox
                      value={row.amount}
                      disabled={!row.ticked}
                      label={`Lượng ${row.name}`}
                      onChange={(amount) =>
                        setUsed((rows) => rows.map((r) => (r === row ? { ...r, amount } : r)))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}

            {unlisted.length > 0 ? (
              <select
                aria-label="Thêm từ tủ lạnh"
                value=""
                onChange={(e) => {
                  const item = pantry.find((p) => p.id === e.target.value)
                  if (item) {
                    setUsed((rows) => [
                      ...rows,
                      { pantryItemId: item.id, name: item.name, have: item.have, amount: '', forDish: '', ticked: true },
                    ])
                  }
                }}
                className="mt-1 h-10 self-start rounded-full bg-transparent pr-2 text-[13px] text-primary"
              >
                <option value="">+ Thêm từ tủ lạnh</option>
                {unlisted.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.have ? ` (${p.have})` : ''}
                  </option>
                ))}
              </select>
            ) : null}

            <p className="pt-1 text-[11px] text-pretty text-muted">
              Gõ “hết” nếu dùng hết. Để trống thì chỉ ghi lại, không trừ tủ.
            </p>
          </section>

          {/* Bought */}
          <section className="flex flex-col rounded-[18px] border border-line bg-surface px-4 pt-3.5 pb-3">
            <div className="flex items-baseline justify-between pb-1.5">
              <h2 className="font-display text-lg font-bold">Mua thêm cho bữa này</h2>
              <span className="text-xs text-muted">bỏ tick nếu không mua</span>
            </div>

            {bought.length > 0 ? (
              <ul>
                {bought.map((row, i) => (
                  <li
                    key={row.key}
                    className={`grid min-h-13 grid-cols-[28px_minmax(0,1fr)_104px] items-center gap-2.5 py-1.5 ${
                      i > 0 ? 'border-t border-line-soft' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.ticked}
                      aria-label={`Đã mua ${row.name}`}
                      onChange={(e) =>
                        setBought((rows) =>
                          rows.map((r) => (r === row ? { ...r, ticked: e.target.checked } : r)),
                        )
                      }
                      className="size-5 accent-[var(--ink)]"
                    />
                    <div className={`flex min-w-0 flex-col ${row.ticked ? '' : 'text-muted'}`}>
                      <span className="truncate">{row.name}</span>
                      <span className="truncate text-[11px] text-muted">
                        {row.forDish ? `công thức cần, tủ không có` : 'thêm tay'}
                      </span>
                    </div>
                    <AmountBox
                      value={row.amount}
                      disabled={!row.ticked}
                      label={`Lượng ${row.name}`}
                      onChange={(amount) =>
                        setBought((rows) => rows.map((r) => (r === row ? { ...r, amount } : r)))
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            <form
              className="mt-1 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const name = newBuy.trim()
                if (!name) return
                if (!bought.some((b) => b.key === keyOf(name))) {
                  setBought((rows) => [...rows, { key: keyOf(name), name, amount: '', forDish: '', ticked: true }])
                }
                setNewBuy('')
              }}
            >
              <input
                value={newBuy}
                onChange={(e) => setNewBuy(e.target.value)}
                placeholder="+ Thêm món đã mua"
                aria-label="Thêm món đã mua"
                className="h-10 min-w-0 grow bg-transparent text-sm outline-none placeholder:text-primary"
              />
              {newBuy.trim() ? (
                <button type="submit" className="h-9 rounded-full bg-ink px-3.5 text-sm text-background">
                  Thêm
                </button>
              ) : null}
            </form>
          </section>
        </>
      ) : null}

      {/* Note */}
      <section className="flex flex-col gap-1.5">
        <label htmlFor="meal-note" className="text-[13px] font-medium">
          Ghi chú
        </label>
        <textarea
          id="meal-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Vợ khen nước kho vừa, lần sau thêm tiêu…"
          className="resize-none rounded-[14px] border border-line bg-surface px-3.5 py-2.5 outline-none placeholder:text-placeholder focus-visible:border-ink"
        />
      </section>

      {error ? (
        <p role="alert" className="text-sm text-primary">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={save}
        disabled={saving || photoBusy}
        className="mt-1 flex h-14 items-center justify-center rounded-full border-2 border-ink bg-ink font-display text-[19px] font-extrabold text-background shadow-pop-primary disabled:opacity-60"
      >
        {saving ? 'Đang lưu…' : used.some((r) => r.ticked) ? 'Lưu bữa · cập nhật tủ' : 'Lưu bữa'}
      </button>
    </div>
  )
}

/** Free-text amount. Outlined in pink when it will not subtract anything the cook probably meant to. */
function AmountBox({
  value,
  disabled,
  label,
  onChange,
}: {
  value: string
  disabled: boolean
  label: string
  onChange: (value: string) => void
}) {
  const kind = parseAmount(value).kind
  return (
    <input
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      placeholder="số lượng"
      className={`h-9 w-full rounded-[10px] border bg-surface px-2.5 text-right font-mono text-sm outline-none placeholder:font-sans placeholder:text-placeholder focus-visible:border-ink disabled:border-dashed disabled:text-placeholder ${
        kind === 'text' ? 'border-primary' : 'border-line'
      }`}
    />
  )
}

function CameraIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  )
}
