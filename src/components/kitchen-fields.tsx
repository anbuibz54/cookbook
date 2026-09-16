'use client'

import { useEffect, useId, useState } from 'react'
import { ingredientSuggestionsAction } from '@/app/_actions/kitchen'
import { normalizeForSearch } from '@/lib/text'

type Suggestion = { name: string; foodId: string | null; recipes: string[] }

export const fieldClass =
  'h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none placeholder:text-placeholder focus-visible:border-ink'

/**
 * Name box with suggestions. Picking one matters: the pantry only knows you
 * have what a recipe needs when the names line up, so names your recipes
 * already use come first ("trong công thức Gà kho gừng"), then foods from the
 * nutrition data. Free typing still works — it just says it matches nothing.
 *
 * Posts `name` and, when a suggestion was picked, `foodId`.
 */
export function IngredientNameField({ autoFocus = false, placeholder }: { autoFocus?: boolean; placeholder: string }) {
  const listId = useId()
  const [value, setValue] = useState('')
  const [picked, setPicked] = useState<Suggestion | null>(null)
  const foodId = picked?.foodId ?? null
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [searched, setSearched] = useState('')

  useEffect(() => {
    const query = value.trim()
    if (!query) return
    let alive = true
    const timer = setTimeout(async () => {
      const found = await ingredientSuggestionsAction(query)
      if (!alive) return
      setSuggestions(found)
      setSearched(query)
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [value])

  const key = normalizeForSearch(value)
  // A picked suggestion is known at once; a typed name waits for its own search.
  const settled = picked != null || searched === value.trim()
  const exact = picked ?? (key ? suggestions.find((s) => normalizeForSearch(s.name) === key) : undefined)
  const shown = key && !picked ? suggestions.slice(0, 6) : []

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${listId}-name`} className="text-xs font-medium text-muted">
        Tên
      </label>
      <input
        id={`${listId}-name`}
        name="name"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setPicked(null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        required
        maxLength={80}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        placeholder={placeholder}
        className={fieldClass}
      />
      <input type="hidden" name="foodId" value={foodId ?? ''} />

      {open && shown.length > 0 ? (
        <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
          {shown.map((s, i) => (
            <li key={s.name} className={i > 0 ? 'border-t border-line-soft' : undefined}>
              <button
                type="button"
                onClick={() => {
                  setValue(s.name)
                  setPicked(s)
                  setOpen(false)
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-line-soft"
              >
                <span className="text-[15px]">{s.name}</span>
                <span className={`text-[11px] ${s.recipes.length ? 'text-protein' : 'text-muted'}`}>
                  {s.recipes.length ? `trong công thức ${s.recipes.slice(0, 2).join(', ')}` : 'có số liệu dinh dưỡng'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {key && settled ? (
        <p className={`text-[11px] text-pretty ${exact?.recipes.length ? 'text-protein' : 'text-muted'}`}>
          {exact?.recipes.length
            ? `✓ Khớp nguyên liệu trong ${exact.recipes.slice(0, 2).join(', ')}.`
            : exact
              ? 'Có số liệu dinh dưỡng, chưa công thức nào dùng tên này.'
              : 'Chưa công thức nào dùng tên này. Vẫn lưu được, nhưng chọn tên gợi ý thì app mới biết bạn nấu được món nào.'}
        </p>
      ) : null}
    </div>
  )
}

function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * "Hạn dùng" with a visible label, a placeholder iOS date inputs cannot show
 * by themselves, and one-tap presets — nobody wants a date wheel for "để được
 * khoảng một tuần".
 */
export function ExpiryField({ today, defaultValue = null }: { today: string; defaultValue?: string | null }) {
  const id = useId()
  const [value, setValue] = useState(defaultValue ?? '')

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        Hạn dùng <span className="font-normal">(không bắt buộc — app nhắc món sắp hỏng)</span>
      </label>
      <div className="relative">
        <input
          id={id}
          name="expiresOn"
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${fieldClass} font-mono text-sm ${value ? '' : 'text-transparent'}`}
        />
        {value ? null : (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[15px] text-placeholder">
            Không ghi hạn
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          ['+3 ngày', 3],
          ['+1 tuần', 7],
          ['+1 tháng', 30],
        ].map(([label, days]) => (
          <button
            key={label}
            type="button"
            onClick={() => setValue(addDays(today, days as number))}
            className="h-8 rounded-full border border-line bg-surface px-3 text-xs hover:border-ink"
          >
            {label}
          </button>
        ))}
        {value ? (
          <button type="button" onClick={() => setValue('')} className="h-8 px-2 text-xs text-muted hover:text-primary">
            Xoá hạn
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** "Lượng" with a visible label; same free-text rules as the meal log. */
export function AmountField({ defaultValue = '', placeholder = '6 quả, 500 g, nửa bó' }: { defaultValue?: string; placeholder?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        Lượng <span className="font-normal">(không bắt buộc)</span>
      </label>
      <input
        id={id}
        name="amount"
        defaultValue={defaultValue}
        autoComplete="off"
        placeholder={placeholder}
        className={fieldClass}
      />
    </div>
  )
}
