# Auth Session Type Detection & Settings Sign-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chrome-session-tied auth (no auto-logout) vs. standalone session (1h expiry, no refresh), plus a sign-out button in the Settings panel.

**Architecture:** `GoogleAuthService.login()` performs a two-phase silent-then-interactive token fetch to detect session type, persists it to `chrome.storage.local`, and gates silent refresh on `'chrome'` sessions only. The auth store tracks `sessionType` in Zustand state and restores it on startup. `SettingsPanel` gains an Account section at the top of its scroll area.

**Tech Stack:** TypeScript, React 19, Zustand 5, Tailwind CSS 4, Chrome Identity API (`chrome.identity.getAuthToken`), Vite + `tsc` for build verification.

---

## File Map

| File | What changes |
|---|---|
| `src/types/auth.types.ts` | Add `sessionType` field to `AuthState` |
| `src/services/api/google-auth.ts` | Two-phase login, conditional refresh, sessionType in storage, logout cleanup |
| `src/services/api/api-client.ts` | 401 handler: treat `null` token from `refreshToken()` as auth failure |
| `src/stores/auth-store.ts` | `sessionType` initial state, login/logout/checkAuth updates |
| `src/components/settings/SettingsPanel.tsx` | Account section with avatar, name/email, sign-out button |

---

## Task 1: Add `sessionType` to `AuthState`

**Files:**
- Modify: `src/types/auth.types.ts`

- [ ] **Step 1: Add the field**

  Open `src/types/auth.types.ts`. Add `sessionType` to `AuthState`:

  ```ts
  export interface AuthState {
    isAuthenticated: boolean
    accessToken: string | null
    tokenExpiry: number | null
    user: GoogleUser | null
    error: string | null
    sessionType: 'chrome' | 'standalone' | null
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npm run build
  ```

  Expected: build succeeds (the store will have a type error until Task 4 — if it does, that's fine; just confirm the type itself is valid by looking at the error message, not a compile failure in `auth.types.ts` itself).

  > Note: the build **will** fail at `auth-store.ts` because the initial state object is now missing `sessionType`. That is expected and will be fixed in Task 4. If the only errors are in `auth-store.ts`, proceed to Task 2.

- [ ] **Step 3: Commit**

  ```bash
  git add src/types/auth.types.ts
  git commit -m "feat: add sessionType field to AuthState"
  ```

---

## Task 2: Update `GoogleAuthService`

**Files:**
- Modify: `src/services/api/google-auth.ts`

### Context

`GoogleAuthService` currently has:
- `login(interactive = true)` — calls `getAuthToken({ interactive })`
- `refreshToken()` — always attempts silent refresh; on failure removes `access_token` + `token_expiry` from storage
- `logout()` — removes `access_token` + `token_expiry` from storage

Changes needed:
1. `login()` drops its parameter; does silent attempt first, falls back to interactive
2. `login()` returns `{ token: string; sessionType: 'chrome' | 'standalone' }` and persists `session_type` to storage
3. `refreshToken()` return type becomes `Promise<string | null>`; returns `null` immediately for standalone sessions
4. `refreshToken()` error-path partial cleanup extended to include `session_type`
5. `logout()` removes `session_type` from storage

- [ ] **Step 1: Add a private `sessionType` field**

  Add directly below `private tokenExpiry: number | null = null`:

  ```ts
  private sessionType: 'chrome' | 'standalone' | null = null
  ```

- [ ] **Step 2: Rewrite `login()`**

  Replace the entire `login` method (currently lines 33–56):

  ```ts
  async login(): Promise<{ token: string; sessionType: 'chrome' | 'standalone' }> {
    try {
      // Phase 1: silent — succeeds if user is signed into Chrome
      let token: string | null = null
      let sessionType: 'chrome' | 'standalone'

      try {
        token = await this.getAuthToken(false)
        sessionType = 'chrome'
      } catch {
        // Phase 2: interactive fallback
        token = await this.getAuthToken(true)
        sessionType = 'standalone'
      }

      if (!token) {
        throw new Error('Failed to obtain access token')
      }

      this.accessToken = token
      this.tokenExpiry = Date.now() + 3600 * 1000
      this.sessionType = sessionType

      await chrome.storage.local.set({
        access_token: this.accessToken,
        token_expiry: this.tokenExpiry,
        session_type: this.sessionType,
      })

      return { token, sessionType }
    } catch (error) {
      console.error('Login error:', error)
      throw new Error('Authentication failed')
    }
  }
  ```

- [ ] **Step 3: Update `refreshToken()` return type and add sessionType branch**

  Replace the entire `refreshToken` method (currently lines 109–131):

  ```ts
  async refreshToken(): Promise<string | null> {
    // Standalone sessions do not refresh — force re-authentication
    if (this.sessionType === 'standalone') {
      return null
    }

    try {
      const token = await this.getAuthToken(false)

      this.accessToken = token
      this.tokenExpiry = Date.now() + 3600 * 1000

      await chrome.storage.local.set({
        access_token: this.accessToken,
        token_expiry: this.tokenExpiry,
      })

      return token
    } catch (error) {
      console.error('Silent refresh failed:', error)
      this.accessToken = null
      this.tokenExpiry = null
      this.sessionType = null
      await chrome.storage.local.remove(['access_token', 'token_expiry', 'session_type'])
      throw error
    }
  }
  ```

- [ ] **Step 4: Update `logout()` to clear `session_type` from storage**

  In the `logout()` method, find the `chrome.storage.local.remove` call (currently line 183) and update it:

  ```ts
  await chrome.storage.local.remove(['access_token', 'token_expiry', 'session_type'])
  ```

  Also find lines 179–180 in `logout()` (the two property-null assignments) and add `this.sessionType = null` immediately after them:

  ```ts
  // lines 179–180 already present:
  this.accessToken = null
  this.tokenExpiry = null
  // add this line:
  this.sessionType = null
  ```

- [ ] **Step 5: Load `sessionType` from storage in `getAccessToken()`**

  `getAccessToken()` currently loads `access_token` and `token_expiry` from storage to restore in-memory state. It must also restore `sessionType` so that `refreshToken()` branches correctly after a service worker restart.

  **Important assumption:** The in-memory fast-path check at lines 85–87 (`if (this.accessToken && this.tokenExpiry && ...)`) only returns early when `this.accessToken` is already set in memory. After a service worker restart all in-memory state is lost (`this.sessionType` is `null`, `this.accessToken` is `null`), so the fast-path is never hit on a cold start — execution always falls through to the storage read where `sessionType` is restored. Once `this.sessionType` is set by either `login()` or this storage-restore path, subsequent calls within the same service worker lifecycle hit the fast-path correctly because `this.sessionType` is already populated in memory. There is no case where the fast-path is hit with `this.sessionType === null` unless `login()` was never called and storage has no token — in that case `getAccessToken()` returns `null` anyway.

  Find the block that reads from storage (currently lines 90–95) and extend it:

  ```ts
  const stored = await chrome.storage.local.get(['access_token', 'token_expiry', 'session_type'])
  if (stored.access_token && stored.token_expiry && Date.now() < Number(stored.token_expiry)) {
    this.accessToken = stored.access_token as string
    this.tokenExpiry = Number(stored.token_expiry)
    this.sessionType = (stored.session_type as 'chrome' | 'standalone') ?? null
    return this.accessToken
  }
  ```

- [ ] **Step 6: Verify build**

  ```bash
  npm run build
  ```

  Expected: no errors in `google-auth.ts`. Errors may still exist in `auth-store.ts` (missing `sessionType` in initial state, call site mismatch) — that is expected until Task 4.

- [ ] **Step 7: Commit**

  ```bash
  git add src/services/api/google-auth.ts
  git commit -m "feat: two-phase login with session type detection and conditional token refresh"
  ```

---

## Task 3: Update `api-client.ts` 401 handler

**Files:**
- Modify: `src/services/api/api-client.ts:85-95`

### Context

The current 401 block (lines 85–95):

```ts
if (response.status === 401) {
  try {
    await googleAuth.refreshToken()
  } catch {
    throw new ApiRequestError('Authentication failed', 401, false)
  }
  attempt--
  continue
}
```

`refreshToken()` now returns `string | null`. A `null` return means the session has expired (standalone) and the retry must stop. Currently the code ignores the return value — if `refreshToken()` returns `null`, the loop would `attempt--; continue` and retry with the same expired token, causing a second 401 and an infinite conceptual loop.

The fix: capture the return value and throw if `null`.

- [ ] **Step 1: Update the 401 block**

  Replace lines 85–95 with:

  ```ts
  if (response.status === 401) {
    // Token may be stale — try refreshing once, then retry
    try {
      const refreshed = await googleAuth.refreshToken()
      if (refreshed === null) {
        // Standalone session expired — no refresh available
        throw new ApiRequestError('Authentication failed', 401, false)
      }
    } catch (err) {
      if (err instanceof ApiRequestError) throw err
      throw new ApiRequestError('Authentication failed', 401, false)
    }
    // Don't count as a retry — just loop immediately
    attempt--
    continue
  }
  ```

- [ ] **Step 2: Verify build**

  ```bash
  npm run build
  ```

  Expected: no errors in `api-client.ts`.

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/api/api-client.ts
  git commit -m "fix: treat null refreshToken return as auth failure in 401 retry handler"
  ```

---

## Task 4: Update auth store

**Files:**
- Modify: `src/stores/auth-store.ts`

### Context

Current store state fields: `isAuthenticated`, `accessToken`, `tokenExpiry`, `user`, `error`.

Changes:
1. Add `sessionType: null` to initial state
2. `login()`: call `googleAuth.login()` (no argument), read `sessionType` from return value
3. `logout()`: set `sessionType: null` in Zustand state
4. `checkAuth()`: wrap cleanup logout in try/catch, restore `sessionType` from storage, set `sessionType: null` in unauthenticated branch

- [ ] **Step 1: Add `sessionType` to initial state**

  In the `create<AuthStore>` call, add to the initial state block:

  ```ts
  sessionType: null,
  ```

- [ ] **Step 2: Update `login()`**

  Replace the `login` action body:

  ```ts
  login: async () => {
    try {
      set({ error: null })

      const { token, sessionType } = await googleAuth.login()
      const user = await googleAuth.getUserInfo()

      set({
        isAuthenticated: true,
        accessToken: token,
        tokenExpiry: Date.now() + 3600 * 1000,
        sessionType,
        user,
        error: null,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed'
      set({
        isAuthenticated: false,
        accessToken: null,
        sessionType: null,
        user: null,
        error: errorMessage,
      })
      throw error
    }
  },
  ```

- [ ] **Step 3: Update `logout()`**

  Add `sessionType: null` to both `set` calls in the logout action:

  ```ts
  logout: async () => {
    try {
      await googleAuth.logout()

      set({
        isAuthenticated: false,
        accessToken: null,
        tokenExpiry: null,
        sessionType: null,
        user: null,
        error: null,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed'
      set({ error: errorMessage })
      throw error
    }
  },
  ```

- [ ] **Step 4: Update `checkAuth()`**

  Replace the entire `checkAuth` action:

  ```ts
  checkAuth: async () => {
    try {
      const isAuth = await googleAuth.isAuthenticated()

      if (isAuth) {
        const token = await googleAuth.getAccessToken()
        const user = await googleAuth.getUserInfo()
        const stored = await chrome.storage.local.get(['session_type'])
        const sessionType = (stored.session_type as 'chrome' | 'standalone') ?? null

        set({
          isAuthenticated: true,
          accessToken: token,
          sessionType,
          user,
          error: null,
        })
      } else {
        // Full cleanup — remove cached Chrome token
        try {
          await googleAuth.logout()
        } catch {
          // Discard — startup cleanup failure must not block the sign-in screen
        }
        set({
          isAuthenticated: false,
          accessToken: null,
          sessionType: null,
          user: null,
        })
      }
    } catch (error) {
      console.error('Auth check error:', error)
      set({
        isAuthenticated: false,
        accessToken: null,
        sessionType: null,
        user: null,
      })
    }
  },
  ```

- [ ] **Step 5: Verify build — should be clean**

  ```bash
  npm run build
  ```

  Expected: zero TypeScript errors. All five affected files compile cleanly.

- [ ] **Step 6: Commit**

  ```bash
  git add src/stores/auth-store.ts
  git commit -m "feat: add sessionType to auth store with two-phase login and cleanup checkAuth"
  ```

---

## Task 5: Account section in SettingsPanel

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

### Context

`SettingsPanel` renders a scrollable `div` (`flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6`). The Account section goes at the top of that div, before the first existing section.

The component doesn't currently import `useAuthStore` or `useUIStore` for sign-out — `useUIStore` is already imported (for `toggleSettings`).

- [ ] **Step 1: Add imports**

  Add to the existing imports at the top of `SettingsPanel.tsx`:

  ```ts
  import { useAuthStore } from '../../stores/auth-store'
  import { useState } from 'react'  // already imported — skip if present
  ```

- [ ] **Step 2: Read auth state and add sign-out state**

  Inside the component function, add after the existing `const { toggleSettings } = useUIStore()` line:

  ```ts
  const { user, logout } = useAuthStore()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState(false)
  ```

- [ ] **Step 3: Add the sign-out handler**

  Add after the state declarations:

  ```ts
  async function handleSignOut() {
    setIsSigningOut(true)
    setSignOutError(null)
    try {
      await logout()
      toggleSettings()
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : 'Sign out failed')
    } finally {
      setIsSigningOut(false)
    }
  }
  ```

- [ ] **Step 4: Add the initials helper**

  Add after `handleSignOut`:

  ```ts
  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  ```

- [ ] **Step 5: Add the Account section JSX**

  Inside the scrollable `div` (`<div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">`), add this as the first child, before any existing `<section>` elements:

  > **Note on the avatar fallback:** Do NOT use `onError` to mutate the DOM directly. React re-applies virtual DOM attributes on every re-render (e.g., when clicking Sign out triggers `isSigningOut` state change), which would restore `style={{ display: 'none' }}` on the initials div, hiding it again. Instead use the `avatarError` state flag added in Step 2.

  ```tsx
  {/* Account */}
  <section className="flex flex-col gap-2">
    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</h3>
    <div className="flex items-center gap-3">
      {/* Avatar — img shown only when picture URL is present and hasn't errored */}
      {user?.picture && !avatarError ? (
        <img
          src={user.picture}
          alt={user.name}
          className="w-8 h-8 rounded-full flex-shrink-0"
          onError={() => setAvatarError(true)}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
          {user ? getInitials(user.name) : '?'}
        </div>
      )}

      {/* Name / email */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{user?.name}</p>
        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 flex-shrink-0"
      >
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>

    {signOutError && (
      <p className="text-xs text-red-600">{signOutError}</p>
    )}
  </section>
  ```

- [ ] **Step 6: Verify build**

  ```bash
  npm run build
  ```

  Expected: clean build, no TypeScript errors.

- [ ] **Step 7: Manual smoke test**

  1. Run `npm run build`, load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked → `dist/`)
  2. Open the side panel and sign in
  3. Open Settings — the Account section should appear at the top with your avatar/name/email and a "Sign out" button
  4. Click "Sign out" — the settings panel should close and the sign-in screen should appear
  5. Sign out from Chrome (`chrome://settings/people`) and reload the extension. Sign in again — the sign-in now requires interactive OAuth (no silent grant). After signing in, session type should be `'standalone'`; verify by opening DevTools → Application → Storage → chrome.storage.local and checking `session_type = "standalone"`
  6. Wait for the 1-hour token expiry (or manually delete `access_token` from chrome.storage.local via DevTools) — the next API call should fail auth and return to the sign-in screen without a silent refresh attempt

- [ ] **Step 8: Commit**

  ```bash
  git add src/components/settings/SettingsPanel.tsx
  git commit -m "feat: add Account section with sign-out to SettingsPanel"
  ```
