import { googleAuth } from './google-auth'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiError {
  status: number
  message: string
  retryable: boolean
}

export class ApiRequestError extends Error {
  status: number
  retryable: boolean

  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.retryable = retryable
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
  maxRetries?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30_000

// Status codes that are safe to retry
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

// ─── API Client ───────────────────────────────────────────────────────────────

export class ApiClient {
  private static instance: ApiClient

  private constructor() {}

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient()
    }
    return ApiClient.instance
  }

  /**
   * Make an authenticated request with exponential backoff retry.
   */
  async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, params, maxRetries = 3 } = options

    const fullUrl = params ? appendParams(url, params) : url

    let lastError: ApiRequestError | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS)
        await sleep(delay)
      }

      try {
        const token = await googleAuth.getAccessToken()
        if (!token) {
          throw new ApiRequestError('Not authenticated', 401, false)
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }

        const response = await fetch(fullUrl, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })

        if (response.status === 401) {
          // Token may be stale — try refreshing once, then retry
          try {
            await googleAuth.refreshToken()
          } catch {
            throw new ApiRequestError('Authentication failed', 401, false)
          }
          // Don't count as a retry — just loop immediately
          attempt--
          continue
        }

        if (response.status === 204) {
          return undefined as T
        }

        if (!response.ok) {
          const retryable = RETRYABLE_STATUSES.has(response.status)
          const text = await response.text().catch(() => '')
          let message = `Request failed: ${response.status}`
          try {
            const json = JSON.parse(text)
            message = json?.error?.message ?? message
          } catch {
            // use default message
          }
          throw new ApiRequestError(message, response.status, retryable)
        }

        return (await response.json()) as T
      } catch (err) {
        if (err instanceof ApiRequestError) {
          lastError = err
          if (!err.retryable || attempt === maxRetries) {
            throw err
          }
          console.warn(`API request failed (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}`)
        } else {
          // Network-level error (offline, DNS, etc.) — always retryable
          const message = err instanceof Error ? err.message : 'Network error'
          lastError = new ApiRequestError(message, 0, true)
          if (attempt === maxRetries) {
            throw lastError
          }
          console.warn(`Network error (attempt ${attempt + 1}/${maxRetries + 1}): ${message}`)
        }
      }
    }

    throw lastError ?? new ApiRequestError('Unknown error', 0, false)
  }

  get<T>(url: string, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(url, { method: 'GET', params })
  }

  post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, { method: 'POST', body })
  }

  put<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, { method: 'PUT', body })
  }

  patch<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, { method: 'PATCH', body })
  }

  delete<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'DELETE' })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function appendParams(
  url: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      qs.set(key, String(value))
    }
  }
  const queryString = qs.toString()
  return queryString ? `${url}?${queryString}` : url
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Export singleton
export const apiClient = ApiClient.getInstance()
