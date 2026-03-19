# Auth: Session Type Detection, Auto-Expiry & Settings Sign-Out

**Date:** 2026-03-19
**Status:** Approved

---

## Overview

Two related improvements to authentication:

1. **Session type detection** — distinguish Chrome-tied sessions (user signed into Chrome) from standalone sessions (interactive OAuth only), and enforce strict 1-hour expiry with no silent refresh for standalone sessions.
2. **Sign-out in settings** — expose an Account section in `SettingsPanel` so the user can sign out without navigating away from the app.

---

## Session Type Detection

### Auth Flow

`GoogleAuthService.login()` no longer takes an `interactive` parameter — it always performs a two-phase internal detection:

1. **Silent attempt:** `chrome.identity.getAuthToken({ interactive: false, scopes })`
   - Success → `sessionType = 'chrome'`; return immediately
2. **Interactive fallback:** `chrome.identity.getAuthToken({ interactive: true, scopes })`
   - Success → `sessionType = 'standalone'`
   - Failure → throw; no session created

`login()` returns `{ token: string, sessionType: 'chrome' | 'standalone' }`. The auth store reads `sessionType` directly from this return value — no separate getter or storage read needed at login time.

`sessionType` is persisted to `chrome.storage.local` alongside `access_token` and `token_expiry`.

The existing `googleAuth.login(true)` call site in `auth-store.ts` must be updated to `googleAuth.login()` (no argument).

### Token Refresh Behaviour

`refreshToken()` return type changes from `Promise<string>` to `Promise<string | null>`.

Branching on `sessionType`:

| Session type | Behaviour |
|---|---|
| `'chrome'` | Silent refresh proceeds as today — Chrome manages token lifecycle; returns `string` |
| `'standalone'` | Returns `null` immediately without attempting `getAuthToken` |

`getAccessToken()` does not need modification. Its existing `try/catch` around `refreshToken()` already returns `null` on error; a `null` return from `refreshToken()` (non-throwing) will also propagate as `null` through the same return path. The auth store interprets a `null` access token as unauthenticated and calls `logout()`.

### `api-client.ts` 401 handling

`api-client.ts` currently calls `refreshToken()` directly on a 401. After this change, `refreshToken()` may return `null`. The 401 retry handler must treat a `null` token the same as a thrown error — clear auth state and stop retrying. The existing `throw` path already stops the loop; the `null` path must also throw (or be handled equivalently) to prevent the retry loop from issuing a second request with no token.

The existing `attempt--; continue` pattern (which prevents a 401 from consuming a retry slot) is preserved as-is. The null-throw exits the loop before `attempt--` is ever reached, so no unbounded-loop risk is introduced.

### Storage Keys Added

- `session_type`: `'chrome' | 'standalone'`

### `logout()` storage cleanup

`GoogleAuthService.logout()` must remove `session_type` from `chrome.storage.local` in addition to `access_token` and `token_expiry`. Omitting this would leave a stale `session_type` readable before the next login's two-phase detection writes a fresh value.

`refreshToken()`'s existing error-path partial cleanup (which currently removes only `access_token` and `token_expiry`) must also be extended to remove `session_type`. Otherwise a Chrome-session silent refresh failure that doesn't reach `logout()` will leave `session_type` stale in storage.

---

## Auth Store Changes

### State

`AuthState` gains:

```ts
sessionType: 'chrome' | 'standalone' | null
```

The Zustand initial state must include `sessionType: null`.

### `login()`

Calls `googleAuth.login()` (no argument). Reads `sessionType` from the return value and stores it in Zustand state alongside token and user.

### `checkAuth()`

Current behaviour sets `isAuthenticated: false` when no valid token exists, but does not call `googleAuth.logout()`, leaving Chrome's cached token in place.

New behaviour: when `isAuthenticated()` returns false, call `logout()` for full cleanup. This must be wrapped in its own `try/catch` that discards errors — a logout failure during startup should not prevent the sign-in screen from rendering. The `else` branch (and the silent-logout catch block) must set `sessionType: null` in Zustand state.

`checkAuth()` must also restore `sessionType` to Zustand state when a valid session is found. After `isAuthenticated()` returns true, `checkAuth()` issues a `chrome.storage.local.get(['session_type'])` call and sets the result in state. This is a separate storage read from the token checks inside `getAccessToken()` — the auth store owns reading `session_type` into Zustand; `GoogleAuthService` only reads `session_type` internally to branch refresh behaviour.

---

## SettingsPanel: Account Section

A new **Account** section is added at the top of the scrollable area in `SettingsPanel`, above the existing Scheduling section.

### Layout

```
[ avatar ]  Name          [Sign out]
            email@...
```

- Avatar: Google profile picture at 32×32, rounded-full. Fallback if `picture` is undefined or the image fails to load: display the user's initials in a slate-coloured circle matching the app's existing style. Initials are derived by splitting `name` on spaces and taking the first character of the first and last tokens; if only one token exists, use the first two characters of that token.
- Name and email stacked in a small column
- "Sign out" button right-aligned, destructive style (red text, no fill)

### Behaviour

- Clicking "Sign out" calls `logout()` from `useAuthStore`
- While sign-out is in progress, the button shows "Signing out…" and is disabled
- On success, `toggleSettings()` is called to close the panel (the app re-renders to `AuthScreen` automatically because `isAuthenticated` becomes false)
- On failure, the error is displayed inline within the Account section (below the user row) — **not** deferred to `AuthScreen`, since a logout failure leaves `isAuthenticated: true` and `AuthScreen` would never render

### Data Source

User name, email, and picture come from `user` in `useAuthStore` — already populated by `getUserInfo()` during login.

---

## Affected Files

| File | Change |
|---|---|
| `src/services/api/google-auth.ts` | Two-phase login (no `interactive` param), `sessionType` storage + cleanup in logout, `refreshToken()` returns `string \| null`, conditional refresh |
| `src/stores/auth-store.ts` | `sessionType: null` initial state, updated `login()` call site, `logout()` clears `sessionType`, `checkAuth()` restores `sessionType` and wraps cleanup logout in try/catch |
| `src/types/auth.types.ts` | Add `sessionType: 'chrome' \| 'standalone' \| null` to `AuthState` |
| `src/components/settings/SettingsPanel.tsx` | New Account section at top of scroll area with inline error display |
| `src/services/api/api-client.ts` | 401 retry handler updated to treat `null` token from `refreshToken()` as an error (stop retrying) |

---

## Out of Scope

- Configurable session duration (not needed; Chrome-tied = persistent, standalone = 1h)
- Any changes to `AuthScreen.tsx` (existing sign-out there remains as-is)
- Token refresh UI / "session expiring" warnings
