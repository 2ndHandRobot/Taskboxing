export interface AuthState {
  isAuthenticated: boolean
  accessToken: string | null
  tokenExpiry: number | null
  user: GoogleUser | null
  error: string | null
  sessionType: 'chrome' | 'standalone' | null
}

export interface GoogleUser {
  id: string
  email: string
  name: string
  picture?: string
}

export interface AuthError {
  error: string
  error_description?: string
}
