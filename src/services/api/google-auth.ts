import type { GoogleUser } from '../../types/auth.types'

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

/**
 * Google Authentication Service
 * Handles OAuth 2.0 flow using Chrome Identity API
 */
export class GoogleAuthService {
  private static instance: GoogleAuthService
  private accessToken: string | null = null
  private tokenExpiry: number | null = null
  private sessionType: 'chrome' | 'standalone' | null = null

  private constructor() {}

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService()
    }
    return GoogleAuthService.instance
  }

  /**
   * Initiate OAuth login flow
   * Attempts silent auth first (Chrome-signed-in); falls back to interactive.
   * @returns Token and session type
   */
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

  /**
   * Get auth token using Chrome Identity API
   */
  private async getAuthToken(interactive: boolean): Promise<string> {
    if (!chrome.identity) {
      throw new Error('Chrome identity API not available')
    }

    try {
      const result = await chrome.identity.getAuthToken({ interactive, scopes: GOOGLE_OAUTH_SCOPES })

      if (!result || !result.token) {
        throw new Error('No token received')
      }

      return result.token
    } catch (error) {
      console.error('getAuthToken error:', error)
      throw error
    }
  }

  /**
   * Get current access token (refreshes if expired)
   */
  async getAccessToken(): Promise<string | null> {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    // Try to load from storage
    const stored = await chrome.storage.local.get(['access_token', 'token_expiry', 'session_type'])
    // Restore sessionType regardless of token expiry so refreshToken() branches correctly
    if (stored.session_type) {
      this.sessionType = stored.session_type as 'chrome' | 'standalone'
    }
    if (stored.access_token && stored.token_expiry && Date.now() < Number(stored.token_expiry)) {
      this.accessToken = stored.access_token as string
      this.tokenExpiry = Number(stored.token_expiry)
      return this.accessToken
    }

    // Token expired or not found, try silent refresh
    try {
      return await this.refreshToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
      return null
    }
  }

  /**
   * Refresh the access token (silent, non-interactive).
   * Returns null immediately for standalone sessions.
   */
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
        session_type: this.sessionType,
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

  /**
   * Get user info from Google
   */
  async getUserInfo(): Promise<GoogleUser> {
    const token = await this.getAccessToken()

    if (!token) {
      throw new Error('Not authenticated')
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
    }
  }

  /**
   * Logout and revoke token
   */
  async logout(): Promise<void> {
    try {
      if (this.accessToken) {
        // Remove cached auth token from Chrome
        await chrome.identity.removeCachedAuthToken({ token: this.accessToken })

        // Revoke token on Google's servers
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.accessToken}`, {
          method: 'POST',
        })
      }

      // Clear local state
      this.accessToken = null
      this.tokenExpiry = null
      this.sessionType = null

      // Clear Chrome storage
      await chrome.storage.local.remove(['access_token', 'token_expiry', 'session_type'])
    } catch (error) {
      console.error('Logout error:', error)
      throw error
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken()
    return token !== null
  }

  /**
   * Get the current session type (restored from storage by getAccessToken)
   */
  getSessionType(): 'chrome' | 'standalone' | null {
    return this.sessionType
  }
}

// Export singleton instance
export const googleAuth = GoogleAuthService.getInstance()
