import { useEffect } from 'react'
import { useAuthStore } from '../stores/auth-store'
import AuthScreen from '../components/auth/AuthScreen'
import Layout from '../components/layout/Layout'

export default function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 p-6">
        <AuthScreen />
      </div>
    )
  }

  return <Layout />
}
