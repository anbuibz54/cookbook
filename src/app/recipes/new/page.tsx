import Link from 'next/link'

/**
 * There is no recipe form yet — recipes come in through Claude over MCP.
 * This page exists so the "+" button lands somewhere that explains that,
 * instead of a 404. Replace it with the real form when it is built.
 */
export default function NewRecipePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-[18px] py-10">
      <h1 className="font-display text-[30px] leading-tight font-extrabold text-balance">
        Thêm công thức qua Claude
      </h1>
      <p className="text-pretty text-muted">
        Form nhập tay chưa làm. Hiện tại bạn gửi link video, ảnh hay đoạn mô tả cho Claude và bảo
        “lưu công thức này”, Claude sẽ tách nguyên liệu, các bước và liên kết số liệu dinh dưỡng rồi
        lưu thẳng vào sổ.
      </p>
      <Link
        href="/settings"
        className="flex h-14 items-center justify-center rounded-full border-2 border-ink bg-ink font-display text-lg font-extrabold text-background shadow-pop-primary"
      >
        Kết nối Claude
      </Link>
      <Link href="/" className="text-center text-sm text-muted hover:text-ink">
        Về trang chủ
      </Link>
    </div>
  )
}
