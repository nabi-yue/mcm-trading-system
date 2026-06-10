import { useState, useEffect, useRef, useMemo } from 'react'
import { Avatar, Button, Modal, Descriptions, Tag, message, Input } from 'antd'
import {
  CloseOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  DeleteOutlined,
  EyeOutlined,
  KeyOutlined,
} from '@ant-design/icons'
import { useAuth } from '../context/AuthContext.jsx'
import { qtyLabel } from '../utils/format.js'

const NotificationModal = ({ open, onClose, onUpdate }) => {
  const { user } = useAuth()
  const [tab, setTab] = useState(null)
  const [requests, setRequests] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const [resetRequests, setResetRequests] = useState([])
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [approvedCode, setApprovedCode] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (open) {
      setClosing(false)
      setMounted(true)
    } else if (mounted) {
      setClosing(true)
      timerRef.current = setTimeout(() => {
        setMounted(false)
        setClosing(false)
      }, 200)
    }
    return () => clearTimeout(timerRef.current)
  }, [open])

  const fetchData = () => {
    if (!open || !user) return
    setLoading(true)
    setNotifLoading(true)
    const params = new URLSearchParams({ usertype: user.usertype, user_id: user.user_id })
    if (user.location_id) params.append('location_id', user.location_id)
    fetch(`/api/inventory/pending-requests?${params}`)
      .then((r) => r.json())
      .then((data) => setRequests(data.success ? data.data : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
    if (user.location_id) {
      fetch(`/api/notifications?location_id=${user.location_id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setNotifications(data.data)
        })
        .catch(() => setNotifications([]))
        .finally(() => setNotifLoading(false))
    }
  }

  const fetchResetRequests = () => {
    if (!open || !user) return
    if (user.usertype !== 1 && user.usertype !== 3) return
    fetch(`/api/auth/reset-requests?usertype=${user.usertype}`)
      .then((r) => r.json())
      .then((data) => setResetRequests(data.success ? data.data : []))
      .catch(() => setResetRequests([]))
  }

  useEffect(() => {
    fetchData()
    fetchResetRequests()
  }, [open, user])

  const groupedRequests = useMemo(() => {
    const groups = {}
    requests.forEach((r) => {
      const key = `${r.from_location_id}|${r.to_location_id}|${r.requester_name}|${r.description || ''}`
      if (!groups[key]) {
        groups[key] = {
          key,
          requester_name: r.requester_name,
          from_location_name: r.from_location_name,
          to_location_name: r.to_location_name,
          created_at: r.created_at,
          description: r.description,
          items: [],
        }
      }
      groups[key].items.push(r)
    })
    return Object.values(groups).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
  }, [requests])

  const handleDelete = async (notificationId) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' })
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.notification_id !== notificationId))
        onUpdate?.()
      }
    } catch {}
  }

  const handleClearAll = async () => {
    if (!user.location_id) return
    try {
      const res = await fetch(`/api/notifications?location_id=${user.location_id}`, { method: 'DELETE' })
      if (res.ok) {
        setNotifications([])
        onUpdate?.()
      }
    } catch {}
  }

  const handleAction = async (requestIds, action) => {
    const ids = Array.isArray(requestIds) ? requestIds : [requestIds]
    const results = await Promise.allSettled(
      ids.map((rid) =>
        fetch(`/api/inventory/request-stock/${rid}/${action}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usertype: user.usertype }),
        }).then((r) => {
          if (!r.ok) throw new Error(`Server returned ${r.status}`)
          return r.json()
        })
      )
    )
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      message.error(`Failed to ${action} ${failed.length} item(s)`)
      return
    }
    if (action === 'accept') {
      const res = await fetch('/api/inventory/notify-accepted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_ids: ids }),
      })
      if (!res.ok) {
        message.error('Failed to send acceptance notification')
        return
      }
    }
    setRequests((prev) => prev.filter((r) => !ids.includes(r.request_id)))
    onUpdate?.()
  }

  const handleResetApprove = async (requestId) => {
    try {
      const res = await fetch(
        `/api/auth/reset-requests/${requestId}/approve?usertype=${user.usertype}&approved_by=${user.user_id}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (res.ok && data.success) {
        setApprovedCode(data.data)
        setApproveModalOpen(true)
        setResetRequests((prev) =>
          prev.map((r) =>
            r.request_id === requestId ? { ...r, status: 'approved', reset_code: data.data.reset_code } : r
          )
        )
        onUpdate?.()
      } else {
        message.error(data.error || 'Failed to approve request')
      }
    } catch {
      message.error('Connection error')
    }
  }

  const handleResetDecline = async (requestId) => {
    try {
      const res = await fetch(
        `/api/auth/reset-requests/${requestId}/decline?usertype=${user.usertype}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (res.ok && data.success) {
        setResetRequests((prev) => prev.filter((r) => r.request_id !== requestId))
        onUpdate?.()
      } else {
        message.error(data.error || 'Failed to decline request')
      }
    } catch {
      message.error('Connection error')
    }
  }

  const timeAgo = (iso) => {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  const fmtQty = (qty, isFabric) => {
    if (isFabric) return qtyLabel(qty)
    return qty
  }

  const [viewGroup, setViewGroup] = useState(null)

  const handleOpenView = (g) => {
    setViewGroup(g)
  }

  const descStyle = {
    label: { color: '#8c8c8c', fontSize: 13, lineHeight: '24px' },
    content: { color: '#262626', fontSize: 14, fontWeight: 500, lineHeight: '24px' },
    container: { margin: 0 },
  }

  if (!mounted) return null

  return (
    <>
      <style>{`
        @keyframes nm-drop {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes nm-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .nm-backdrop {
          animation: nm-fade 0.2s ease-out both;
        }
        .nm-backdrop.closing {
          animation: nm-fade 0.15s ease-in reverse both;
        }
        .nm-panel {
          animation: nm-drop 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .nm-panel.closing {
          animation: nm-drop 0.15s ease-in reverse both;
        }
      `}</style>
      <div
        className={'nm-backdrop' + (closing ? ' closing' : '')}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1049,
          background: 'rgba(0,0,0,0.15)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      />
      <div
        className={'nm-panel' + (closing ? ' closing' : '')}
        style={{
          position: 'fixed', top: 64, right: 40, zIndex: 1050,
          width: 440, maxHeight: 'calc(100vh - 80px)',
          background: '#fff', borderRadius: 18,
          boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
        }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: '#0a0a0a' }}>Notifications</span>
            <Button type="text" onClick={onClose} icon={<CloseOutlined />} style={{ fontSize: 15, color: '#999' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="small"
              onClick={() => setTab(tab === 'system' ? null : 'system')}
              style={{
                borderRadius: 8, fontSize: 13, height: 32,
                background: tab === 'system' ? '#1677ff' : '#f0f0f0',
                color: tab === 'system' ? '#fff' : '#333',
                border: 'none', fontWeight: tab === 'system' ? 600 : 400,
              }}
            >
              System
            </Button>
            <Button
              size="small"
              onClick={() => setTab(tab === 'pending' ? null : 'pending')}
              style={{
                borderRadius: 8, fontSize: 13, height: 32,
                background: tab === 'pending' ? '#1677ff' : '#f0f0f0',
                color: tab === 'pending' ? '#fff' : '#333',
                border: 'none', fontWeight: tab === 'pending' ? 600 : 400,
              }}
            >
              Pending
            </Button>
            {(user.usertype === 1 || user.usertype === 3) && (
              <Button
                size="small"
                onClick={() => setTab(tab === 'resets' ? null : 'resets')}
                style={{
                  borderRadius: 8, fontSize: 13, height: 32,
                  background: tab === 'resets' ? '#1677ff' : '#f0f0f0',
                  color: tab === 'resets' ? '#fff' : '#333',
                  border: 'none', fontWeight: tab === 'resets' ? 600 : 400,
                }}
              >
                Resets
              </Button>
            )}
            {(tab === null || tab === 'system') && notifications.length > 0 && (
              <Button
                size="small"
                icon={<DeleteOutlined />}
                onClick={handleClearAll}
                style={{ marginLeft: 'auto', borderRadius: 8, fontSize: 13, height: 32 }}
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {(tab === null || tab === 'system') && (
            <>
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div
                    key={`notif-${n.notification_id}`}
                    style={{ padding: '12px 24px', borderBottom: '1px solid #f5f5f5', background: n.is_read ? 'transparent' : '#f0f5ff' }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0,
                        background: n.type === 'restock_failed' ? '#ff4d4f' : n.type === 'restock_pending' ? '#fa8c16' : '#52c41a',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: '#333', lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{timeAgo(n.created_at)}</div>
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => handleDelete(n.notification_id)}
                        style={{ color: '#bfbfbf', fontSize: 12, flexShrink: 0, marginTop: 2 }}
                      />
                    </div>
                  </div>
                ))
              ) : null}
            </>
          )}
          {(tab === null || tab === 'pending') && (
            <>
              {requests.length > 0 ? (
                groupedRequests.map((g) => {
                  const isBulk = g.items.length > 1
                  return (
                    <div
                      key={g.key}
                      style={{ padding: '16px 24px', borderBottom: '1px solid #f5f5f5' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', gap: 12 }}>
                        <Avatar size={44} style={{ background: '#1677ff', fontSize: 19, fontWeight: 600, flexShrink: 0 }}>
                          {g.requester_name?.[0]?.toUpperCase() || '?'}
                        </Avatar>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, color: '#333', lineHeight: 1.4 }}>
                            <strong>{g.requester_name}</strong>{' '}
                            {isBulk ? (
                              <>requested <strong>bulk restock ({g.items.length} items)</strong></>
                            ) : (
                              <>requested{' '}
                                <strong>{fmtQty(g.items[0].quantity, g.items[0].is_fabric)} {g.items[0].product_name}</strong>
                                {(() => {
                                  const sv = [g.items[0].variety_color, g.items[0].variety_pattern].filter(Boolean).join(' ')
                                  return sv ? <span style={{ color: '#8c8c8c', fontWeight: 400 }}> ({sv})</span> : null
                                })()}
                              </>
                            )}
                          </div>
                          <div style={{ fontSize: 15, color: '#8c8c8c', marginTop: 4 }}>
                            {g.from_location_name} → {g.to_location_name} · {timeAgo(g.created_at)}
                          </div>
                          {!isBulk && g.items[0].description && (
                            <div style={{ fontSize: 15, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
                              "{g.items[0].description}"
                            </div>
                          )}
                          {isBulk && (
                            <div style={{ fontSize: 14, color: '#666', marginTop: 6 }}>
                              {g.items.slice(0, 3).map((i) => {
                                const iVariety = [i.variety_color, i.variety_pattern].filter(Boolean).join(' ')
                                return (
                                  <div key={i.request_id} style={{ lineHeight: 1.6 }}>
                                    · {fmtQty(i.quantity, i.is_fabric)} {i.product_name}
                                    {iVariety ? <span style={{ color: '#8c8c8c' }}> ({iVariety})</span> : null}
                                  </div>
                                )
                              })}
                              {g.items.length > 3 && (
                                <div style={{ color: '#8c8c8c' }}>and {g.items.length - 3} more...</div>
                              )}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <Button
                              size="small"
                              icon={<CloseCircleOutlined />}
                              onClick={() => handleAction(g.items.map((i) => i.request_id), 'decline')}
                              style={{
                                borderRadius: 8, fontSize: 15, height: 36,
                                border: '1px solid #ff4d4f', color: '#ff4d4f',
                                background: '#fff', padding: '0 18px',
                              }}
                            >
                              Decline
                            </Button>
                            <Button
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => handleOpenView(g)}
                              style={{
                                borderRadius: 8, fontSize: 15, height: 36,
                                border: '1px solid #1677ff', color: '#1677ff',
                                background: '#fff', padding: '0 18px',
                              }}
                            >
                              View
                            </Button>
                            <Button
                              size="small"
                              icon={<CheckOutlined />}
                              onClick={() => handleAction(g.items.map((i) => i.request_id), 'accept')}
                              style={{
                                borderRadius: 8, fontSize: 15, height: 36,
                                background: '#52c41a', borderColor: '#52c41a',
                                color: '#fff', boxShadow: 'none', padding: '0 18px',
                              }}
                            >
                              Accept
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : null}
            </>
          )}
          {(tab === null || tab === 'resets') && (user.usertype === 1 || user.usertype === 3) && (
            <>
              {resetRequests.length > 0 ? (
                resetRequests.map((rr) => (
                  <div
                    key={`reset-${rr.request_id}`}
                    style={{ padding: '16px 24px', borderBottom: '1px solid #f5f5f5' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Avatar size={44} style={{ background: '#722ed1', fontSize: 19, fontWeight: 600, flexShrink: 0 }}>
                        {rr.username?.[0]?.toUpperCase() || '?'}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, color: '#333', lineHeight: 1.4 }}>
                          <strong>{rr.username}</strong>
                          {rr.location_name && <span style={{ color: '#8c8c8c', fontWeight: 400 }}> ({rr.location_name})</span>}
                          {' '}requested <strong>password reset</strong>
                        </div>
                        <div style={{ fontSize: 15, color: '#8c8c8c', marginTop: 4 }}>
                          {timeAgo(rr.created_at)}
                          {rr.status === 'approved' && (
                            <Tag color="green" style={{ marginLeft: 8 }}>Approved</Tag>
                          )}
                        </div>
                        {rr.requester_note && (
                          <div style={{ fontSize: 15, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
                            "{rr.requester_note}"
                          </div>
                        )}
                        {rr.status === 'approved' && rr.reset_code && (
                          <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6ffed', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <KeyOutlined style={{ color: '#52c41a' }} />
                            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: '#262626', fontFamily: 'monospace' }}>
                              {rr.reset_code}
                            </span>
                          </div>
                        )}
                        {rr.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <Button
                              size="small"
                              icon={<CloseCircleOutlined />}
                              onClick={() => handleResetDecline(rr.request_id)}
                              style={{
                                borderRadius: 8, fontSize: 15, height: 36,
                                border: '1px solid #ff4d4f', color: '#ff4d4f',
                                background: '#fff', padding: '0 18px',
                              }}
                            >
                              Decline
                            </Button>
                            <Button
                              size="small"
                              icon={<CheckOutlined />}
                              onClick={() => handleResetApprove(rr.request_id)}
                              style={{
                                borderRadius: 8, fontSize: 15, height: 36,
                                background: '#52c41a', borderColor: '#52c41a',
                                color: '#fff', boxShadow: 'none', padding: '0 18px',
                              }}
                            >
                              Approve
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : null}
            </>
          )}
          {notifications.length === 0 && requests.length === 0 && resetRequests.length === 0 && (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <InboxOutlined style={{ fontSize: 50, color: '#d9d9d9', marginBottom: 12 }} />
              <div style={{ fontSize: 17, color: '#8c8c8c' }}>No notifications</div>
            </div>
          )}
        </div>
      </div>

      <Modal
        title={
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            <EyeOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            {viewGroup && viewGroup.items.length > 1
              ? 'Bulk Restock Details'
              : 'Stock Request Details'}
          </span>
        }
        open={!!viewGroup}
        onCancel={() => setViewGroup(null)}
        footer={[
          <Button key="close" onClick={() => setViewGroup(null)}>
            Close
          </Button>,
        ]}
        width={520}
        zIndex={1060}
      >
        {viewGroup && (
          <div style={{ padding: '8px 0' }}>
            <div
              style={{
                background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 10,
                padding: '16px 20px', marginBottom: 20,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: '#666' }}>Status</div>
                <Tag color="orange" style={{ marginTop: 4, fontSize: 13, padding: '2px 10px', borderRadius: 6 }}>
                  Pending
                </Tag>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#666' }}>Requested</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginTop: 2 }}>
                  {timeAgo(viewGroup.created_at)}
                </div>
              </div>
            </div>

            <Descriptions
              column={1}
              labelStyle={descStyle.label}
              contentStyle={descStyle.content}
              style={descStyle.container}
            >
              <Descriptions.Item label="From">
                <span style={{ color: '#262626' }}>{viewGroup.from_location_name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="To">
                <span style={{ color: '#262626' }}>{viewGroup.to_location_name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Requested by">
                <span style={{ color: '#262626' }}>{viewGroup.requester_name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Date">
                <span style={{ color: '#262626' }}>
                  {new Date(viewGroup.created_at).toLocaleString()}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
                Items ({viewGroup.items.length})
              </div>
              {viewGroup.items.map((item, idx) => {
                const varietyLabel = [item.variety_color, item.variety_pattern].filter(Boolean).join(' ')
                return (
                  <div
                    key={item.request_id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', borderRadius: 8,
                      background: idx % 2 === 0 ? '#fafafa' : 'transparent',
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 14, color: '#333', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.variety_color && (
                        <span
                          style={{
                            display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                            background: item.variety_color, border: '1px solid #d9d9d9', flexShrink: 0,
                          }}
                        />
                      )}
                      <span>{item.product_name}</span>
                      {varietyLabel && (
                        <span style={{ color: '#8c8c8c', fontWeight: 400, fontSize: 13 }}>
                          ({varietyLabel})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1677ff' }}>
                      {fmtQty(item.quantity, item.is_fabric)}
                    </div>
                  </div>
                )
              })}
            </div>

            {viewGroup.description && viewGroup.items.length === 1 && (
              <div style={{ marginTop: 16, fontSize: 14, color: '#666', fontStyle: 'italic', borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                Note: "{viewGroup.description}"
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        title={
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            <CheckOutlined style={{ marginRight: 8, color: '#52c41a' }} />
            Reset Code Generated
          </span>
        }
        open={approveModalOpen}
        onCancel={() => { setApproveModalOpen(false); setApprovedCode(null) }}
        footer={[
          <Button key="close" type="primary" onClick={() => { setApproveModalOpen(false); setApprovedCode(null) }}>
            Done
          </Button>,
        ]}
        width={420}
        zIndex={1060}
      >
        {approvedCode && (
          <div style={{ padding: '8px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: '#666', marginBottom: 16 }}>
              Share this code with <strong>{approvedCode.username}</strong> to complete their password reset.
            </div>
            <div style={{
              background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 12,
              padding: '20px 24px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 8 }}>Reset Code</div>
              <Input
                value={approvedCode.reset_code}
                readOnly
                style={{
                  textAlign: 'center', fontSize: 32, fontWeight: 700, letterSpacing: 12,
                  height: 64, color: '#262626', fontFamily: 'monospace',
                  border: 'none', background: 'transparent', cursor: 'text',
                }}
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
                Expires: {new Date(approvedCode.expires_at).toLocaleString()}
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#8c8c8c' }}>
              This code is valid for 24 hours from approval.
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default NotificationModal
