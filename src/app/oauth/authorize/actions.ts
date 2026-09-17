'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { createCode, getClient, redirectAllowed } from '@/server/oauth/service'

function field(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * The form's hidden fields came from the browser, so everything is checked
 * again here; the page's own checks only decide what to show.
 */
async function validated(form: FormData) {
  const clientId = field(form, 'client_id')
  const redirectUri = field(form, 'redirect_uri')
  const client = clientId ? await getClient(db, clientId) : null
  if (!client || !redirectAllowed(client, redirectUri)) throw new Error('Invalid OAuth request.')
  return { client, redirectUri, state: field(form, 'state'), codeChallenge: field(form, 'code_challenge') }
}

function back(redirectUri: string, params: Record<string, string>): never {
  const url = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
  redirect(url.toString())
}

export async function approveAction(form: FormData) {
  const { user } = await requireUser()
  const { client, redirectUri, state, codeChallenge } = await validated(form)
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) back(redirectUri, { error: 'invalid_request', state })

  const code = await createCode(db, { clientId: client.clientId, userId: user.id, redirectUri, codeChallenge })
  back(redirectUri, { code, state })
}

export async function denyAction(form: FormData) {
  await requireUser()
  const { redirectUri, state } = await validated(form)
  back(redirectUri, { error: 'access_denied', error_description: 'Người dùng đã từ chối.', state })
}
