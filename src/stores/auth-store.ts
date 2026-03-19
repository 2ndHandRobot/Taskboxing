import { create } from 'zustand'
import { googleAuth } from '../services/api/google-auth'
import type { AuthState, GoogleUser } from '../types/auth.types'

interface AuthStore extends AuthState {
  // Actions
  login: () => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  accessToken: null,
  tokenExpiry: null,
  sessionType: null,
  user: null,
  error: null,

  // Actions
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

  clearError: () => {
    set({ error: null })
  },
}))
