# Auth Flow — Final state (Deploy H.6 · 2026-04-25)

## Architecture

```
[lumorafinance.com.br]
       │
       ├─ /login → Google Identity Services (GSI) iframe
       │   click → google.accounts.id.callback (id_token JWT)
       │   → supabase.auth.signInWithIdToken({provider:'google', token, nonce})
       │   → cookies set
       │   → router.push('/dashboard')
       │
       └─ /dashboard → Sair da conta (button onClick)
           → server action signOut() — clears Supabase cookies
           → window.location.href = '/login' (hard navigation)
           → middleware sees no session → renders /login
```

## Why GSI instead of signInWithOAuth

Goal: remove `supabase.co` from Google's "Continue to..." consent text.

`signInWithOAuth` flow:
- Browser → Google authorize endpoint w/ `redirect_uri=ajmbzzaiinowpmkxnism.supabase.co/auth/v1/callback`
- Google shows "Continue to **ajmbzzaiinowpmkxnism.supabase.co**" — Supabase is the OAuth intermediary
- After consent, Google → Supabase callback → app `/api/auth/callback` → exchangeCodeForSession

GSI (`signInWithIdToken`) flow:
- Browser loads `accounts.google.com/gsi/client`
- google.accounts.id renders official button (or shows One Tap)
- User picks account → Google returns id_token JWT directly to the page
- App passes JWT to `supabase.auth.signInWithIdToken({provider: 'google', token, nonce})`
- Supabase validates JWT signature + nonce hash, creates session
- **No `redirect_uri` to supabase.co** — Google shows "Continue to **lumorafinance.com.br**" (the JS origin)

Cost: free. No Supabase Pro Custom Auth Domain needed.

## Why hard navigation on logout (not server-side redirect)

Bug fixed in Deploy H.6:
- Old: `signOut()` server action did `redirect('/login')` after clearing cookies
- Next 16 + RSC streaming: the `(app)/layout.tsx` re-renders **mid-stream** with the new (no-cookies) state, calling its own `redirect('/login')` because `getUser()` returns null
- Race: the layout's redirect throws NEXT_REDIRECT before signOut's redirect fully propagates → `global-error.tsx` flashes "Erro inesperado" for ~1s before navigation completes

Fix: `signOut()` only clears cookies, returns void. Sidebar's button does `window.location.href = '/login'` after. Hard navigation = browser tears down React tree, no RSC streaming ambiguity.

## Performance metrics (prod, edge=GRU/IAD)

### TTFB on `/login` (5 cold runs)

| Run | TTFB | Total |
|-----|------|-------|
| 1   | 156 ms | 156 ms |
| 2   | 117 ms | 118 ms |
| 3   | 128 ms | 128 ms |
| 4   | 118 ms | 118 ms |
| 5   |  95 ms |  97 ms |

P50: ~118 ms. Within edge SLA.

### Page load metrics

| Metric | `/login` | `/dashboard` |
|--------|----------|--------------|
| TTFB (request → first byte) | 20 ms | 33 ms |
| DOM Interactive | 116 ms | 116 ms |
| DOM ContentLoaded | 116 ms | 122 ms |
| Load Event End | 198 ms | 204 ms |
| Transfer Size | 3.4 KB (gzipped HTML) | — |

Both pages render under 250 ms after navigation (browser-perceived "page is ready").

### End-to-end Google login latency

Click GSI button → `/dashboard` interactive:
- Popup open: < 100 ms
- Account chooser render: ~200 ms
- (User clicks account: 0–2s thinking)
- id_token returned + Supabase validation: ~500–800 ms
- router.push + dashboard render: ~200 ms

**Non-user time: ~1.0–1.5 s**. Within "instant" perception threshold.

### Logout latency

Click Sair da conta → `/login` interactive:
- Server action signOut() (cookie clear): ~200–500 ms
- window.location.href hard nav: < 100 ms
- /login render: ~200 ms (TTFB 95–155 ms + DOM 116 ms)

**Total: < 1 second wall-clock**.

## Domain configuration

- `lumorafinance.com.br` (apex) — A 216.198.79.1
- `www.lumorafinance.com.br` — CNAME cname.vercel-dns.com
- `lumora-finance.vercel.app` — 301 redirect to apex via middleware

## Google OAuth Client (`Lumora Web`)

Authorized JavaScript Origins:
- `https://lumorafinance.com.br`
- `https://www.lumorafinance.com.br`
- `https://lumora-finance.vercel.app` (legacy fallback; redirected by middleware)

Authorized Redirect URIs:
- `https://ajmbzzaiinowpmkxnism.supabase.co/auth/v1/callback` (kept for legacy signInWithOAuth fallback)

## Supabase Auth Configuration

- **Site URL**: `https://lumorafinance.com.br`
- **Redirect URLs allowlist**:
  - `https://lumora-finance.vercel.app/api/auth/callback`
  - `http://localhost:3000/api/auth/callback`
  - `https://lumorafinance.com.br/api/auth/callback`
  - `https://www.lumorafinance.com.br/api/auth/callback`

## Vercel env vars

- `NEXT_PUBLIC_APP_URL=https://lumorafinance.com.br`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=1068623213008-24u3r7jl1fc8ejtj1pasdr5s5egj6vrn.apps.googleusercontent.com`

## Rollback

If GSI breaks (e.g., Google API change), the LoginForm has a fallback button using `signInWithOAuth`. Delete `NEXT_PUBLIC_GOOGLE_CLIENT_ID` from Vercel env to force fallback at runtime.

Full revert path:
```bash
git revert d26b88e..6c09286   # reverts GSI + hard-logout
git push
```

## Commits in this work

- `4a11277` — middleware bypass for `/api/auth/*` (callback was being kicked to /login)
- `a9f1303` — code fallback URLs to lumorafinance.com.br
- `48cedf9` — env redeploy
- `0973f9c` — admin SaaS metrics dashboard (separate)
- `d26b88e` — GSI + signInWithIdToken (kills supabase.co consent)
- `5e8f1c8` — middleware redirect lumora-finance.vercel.app → canonical (login refactor reverted in 596e727)
- `596e727` — revert d26b88e refactor that broke /login
- `6c09286` — logout via client navigation (kills "Erro inesperado" flash)
