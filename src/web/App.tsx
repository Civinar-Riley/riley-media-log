import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './auth'
import { CategoriesProvider } from './cat'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ListPage from './pages/ListPage'
import ItemDetailPage from './pages/ItemDetailPage'
import ItemFormPage from './pages/ItemFormPage'
import StatsPage from './pages/StatsPage'
import RandomPage from './pages/RandomPage'
import ListsPage from './pages/ListsPage'
import ListDetailPage from './pages/ListDetailPage'
import ManageFieldsPage from './pages/ManageFieldsPage'
import SettingsPage from './pages/SettingsPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, authed, error, retry } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="serif text-2xl tracking-[0.3em] text-faint">书影集</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <p className="text-sm text-faint">登录状态检查失败，请检查网络后重试。</p>
        <button className="btn" onClick={retry}>
          重试
        </button>
      </div>
    )
  }
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <CategoriesProvider>
              <Layout />
            </CategoriesProvider>
          </RequireAuth>
        }
      >
        <Route index element={<ListPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="items/:id/edit" element={<ItemFormPage />} />
        <Route path="new" element={<ItemFormPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="random" element={<RandomPage />} />
        <Route path="lists" element={<ListsPage />} />
        <Route path="lists/:id" element={<ListDetailPage />} />
        <Route path="manage" element={<ManageFieldsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
