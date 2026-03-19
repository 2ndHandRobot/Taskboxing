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

On `login()`, a two-phase token attempt determines session type:

1. **Silent attempt:** `chrome.identity.getAuthToken({ interactive: false, scopes })`
   - Success → `sessionType = 'chrome'`
2. **Interactive fallback:** `chrome.identity.getAuthToken({ interactive: true, scopes })`
   - Success → `sessionType = 'standalone'`
   - Failure → throw, no session created

`sessionType` is persisted to `chrome.storage.local` alongside `access_token` and `token_expiry`.

### Token Refresh Behaviour

`refreshToken()` in `GoogleAuthService` branches on `sessionType`:

| Session type | Behaviour |
|---|---|
| `'chrome'` | Silent refresh proceeds as today — Chrome manages token lifecycle |
| `'standalone'` | No refresh attempted — returns `null` immediately |

When `getAccessToken()` receives `null` from `refreshToken()`, the caller (auth store) interprets this as an expired session and triggers logout.

### Storage Keys Added

- `session_type`: `'chrome' | 'standalone'`

---

## Auth Store Changes

### State

`AuthState` gains:

```ts
sessionType: 'chrome' | 'standalone' | null
```

### `login()`

After `googleAuth.login()` completes, reads `sessionType` from the service and stores it in Zustand state.

### `checkAuth()`

Current behaviour sets `isAuthenticated: false` when no valid token exists, but does not call `googleAuth.logout()`, leaving Chrome's cached token in place.

New behaviour: when `isAuthenticated()` returns false, call `logout()` (full cleanup) rather than just updating state flags. This ensures the cached token is removed and the user is returned cleanly to the sign-in screen.

---

## SettingsPanel: Account Section

A new **Account** section is added at the top of the scrollable area in `SettingsPanel`, above the existing Scheduling section.

### Layout

```
[ avatar ]  Name          [Sign out]
            email@...
```

- Avatar: Google profile picture, 32×32 circle
- Name and email stacked in a small column
- "Sign out" button right-aligned, destructive style (red text, no fill)

### Behaviour

- Clicking "Sign out" calls `logout()` from `useAuthStore`, then calls `toggleSettings()` to close the panel
- While sign-out is in progress, the button shows "Signing out…" and is disabled
- If logout throws, the error is surfaced via the existing `error` field in auth state (displayed in `AuthScreen` after panel closes)

### Data Source

User name, email, and picture come from `user` in `useAuthStore` — already populated by `getUserInfo()` during login.

---

## Affected Files

| File | Change |
|---|---|
| `src/services/api/google-auth.ts` | Two-phase login, `sessionType` storage, conditional refresh |
| `src/stores/auth-store.ts` | `sessionType` state field, updated `login()`, fixed `checkAuth()` logout |
| `src/types/auth.types.ts` | Add `sessionType` to `AuthState` |
| `src/components/settings/SettingsPanel.tsx` | New Account section at top of scroll area |

---

## Out of Scope

- Configurable session duration (not needed; Chrome-tied = persistent, standalone = 1h)
- Any changes to `AuthScreen.tsx` (existing sign-out there remains as-is)
- Token refresh UI / "session expiring" warnings
