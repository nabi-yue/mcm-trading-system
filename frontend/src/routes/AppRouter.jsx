import { lazy, Suspense } from 'react'
import { Spin } from 'antd'
import { Route, 
  createBrowserRouter, 
  createRoutesFromElements, 
  RouterProvider 
} from 'react-router-dom'

import AuthLayout from './../layouts/AuthLayout'
import Login from './../pages/auth/Login'
import ForgotPassword from './../pages/auth/ForgotPassword'
import ResetPassword from './../pages/auth/ResetPassword'
import ResetWithCode from './../pages/auth/ResetWithCode'

import DashboardLayout from './../layouts/DashboardLayout'

import ProtectedRoute from './ProtectedRoute'

const Owner = lazy(() => import('../pages/dashboard/Owner'))
const Manager = lazy(() => import('../pages/dashboard/Manager'))
const Admin = lazy(() => import('../pages/dashboard/Admin'))

const Inventory = lazy(() => import('../pages/module/Inventory'))
const Maintenance = lazy(() => import('../pages/module/Maintenance'))
const StockManagement = lazy(() => import('../pages/module/StockManagement'))
const Sales = lazy(() => import('../pages/module/Sales'))
const UserAccess = lazy(() => import('../pages/module/UserAccess'))
const Report = lazy(() => import('../pages/module/Reports'))
const SettingsPage = lazy(() => import('../pages/module/Settings'))
const Help = lazy(() => import('../pages/module/Help'))
const About = lazy(() => import('../pages/module/About'))
const Manual = lazy(() => import('../pages/module/Manual'))

const Lazy = ({ children }) => <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Spin size="large" /></div>}>{children}</Suspense>
//Contains all paths to pages

const router = createBrowserRouter (
  createRoutesFromElements(
        <Route>

      <Route path="/" element={<AuthLayout />}>
        <Route index element={<Login />} />
        <Route path="login" element={<Login />} />

        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password/:token" element={<ResetPassword />} />
        <Route path="reset-with-code" element={<ResetWithCode />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["owner", "manager", "admin"]} />}>
        <Route path="/dashboard" element={<DashboardLayout />}>

          {/* role dashboards */}
          <Route element={<ProtectedRoute allowedRoles={["owner"]} />}>
            <Route path="owner" element={<Lazy><Owner /></Lazy>} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["manager"]} />}>
            <Route path="manager" element={<Lazy><Manager /></Lazy>} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="admin" element={<Lazy><Admin /></Lazy>} />
          </Route>

          {/* shared - owner and manager */}
          <Route element={<ProtectedRoute allowedRoles={["owner", "manager"]} />}>
            <Route path="inventory" element={<Lazy><Inventory /></Lazy>} />
            <Route path="sales" element={<Lazy><Sales /></Lazy>} />
            <Route path="stock-management" element={<Lazy><StockManagement /></Lazy>} />
          </Route>

          {/* report - all roles */}
          <Route element={<ProtectedRoute allowedRoles={["owner", "manager", "admin"]} />}>
            <Route path="report" element={<Lazy><Report /></Lazy>} />
          </Route>

          {/* owner only */}
          <Route element={<ProtectedRoute allowedRoles={["owner"]} />}>
            <Route path="users" element={<Lazy><UserAccess /></Lazy>} />
          </Route>

          {/* admin and owner - maintenance */}
          <Route element={<ProtectedRoute allowedRoles={["admin", "owner"]} />}>
            <Route path="maintenance" element={<Lazy><Maintenance /></Lazy>} />
          </Route>

          {/* settings - all roles */}
          <Route element={<ProtectedRoute allowedRoles={["owner", "manager", "admin"]} />}>
            <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
          </Route>

          {/* help and about - all roles */}
          <Route element={<ProtectedRoute allowedRoles={["owner", "manager", "admin"]} />}>
            <Route path="help" element={<Lazy><Help /></Lazy>} />
            <Route path="about" element={<Lazy><About /></Lazy>} />
            <Route path="manual" element={<Lazy><Manual /></Lazy>} />
          </Route>

        </Route>
      </Route>

    </Route>
  )
)

export default router;