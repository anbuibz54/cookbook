'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Sign-in only. Accounts are the shared Supabase Auth users LifeOS already
 * created, so there is no sign-up here — make the account in LifeOS.
 */

export type AuthFormState = { error: string | null }

const credentials = z.object({
  email: z.email('Email không hợp lệ.'),
  password: z.string().min(1, 'Nhập mật khẩu.'),
})

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Email này chưa được xác nhận. Kiểm tra hộp thư để lấy link xác nhận.' }
    }
    return { error: 'Sai email hoặc mật khẩu.' }
  }

  const next = formData.get('next')
  revalidatePath('/', 'layout')
  redirect(typeof next === 'string' && next.startsWith('/') ? next : '/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
