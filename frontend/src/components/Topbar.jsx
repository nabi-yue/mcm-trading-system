import { useState, useEffect, useCallback } from 'react'
import { Typography, Button, Badge } from 'antd'
import { LogoutOutlined, BellOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext.jsx'
import NotificationModal from './NotificationModal.jsx'

const { Title } = Typography

const Topbar = () => {
  const { user, logout, theme } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [notifCount, setNotifCount] = useState(0)
  const [resetCount, setResetCount] = useState(0)
  const isDark = theme === 'dark'

  const fetchCounts = useCallback(() => {
    if (!user) return
    const params = new URLSearchParams({ usertype: user.usertype, user_id: user.user_id })
    if (user.location_id) params.append('location_id', user.location_id)
    fetch(`/api/inventory/pending-requests?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setPendingCount((data.data || []).length)
      })
      .catch(() => {})
    if (user.location_id) {
      fetch(`/api/notifications/count?location_id=${user.location_id}&_t=${Date.now()}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setNotifCount(data.count || 0)
        })
        .catch(() => {})
    }
    if (user.usertype === 1 || user.usertype === 3) {
      fetch(`/api/auth/reset-requests/count?usertype=${user.usertype}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setResetCount(data.count || 0)
        })
        .catch(() => {})
    }
  }, [user])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  const handleCloseNotif = () => {
    setNotifOpen(false)
    fetchCounts()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ width: 240 }} />
      <Title level={4} style={{ margin: 0, color: isDark ? 'rgba(255,255,255,0.85)' : '#262626', textAlign: 'center', flex: 1 }}>
        Manco (MCM) Trading
      </Title>
      <div style={{ width: 240, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <Badge count={(pendingCount || 0) + (notifCount || 0) + (resetCount || 0)} size="small" offset={[-2, 2]}>
          <Button
            icon={<BellOutlined />}
            onClick={() => { setNotifOpen(true); fetchCounts() }}
            type="text"
            style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#595959', fontSize: 16 }}
          />
        </Badge>
        <Button icon={<LogoutOutlined />} onClick={logout} type="text" style={{ color: '#ff4d4f' }}>
          Logout
        </Button>
      </div>
      <NotificationModal open={notifOpen} onClose={handleCloseNotif} onUpdate={fetchCounts} />
    </div>
  )
}

export default Topbar
