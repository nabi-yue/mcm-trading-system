import { useState } from 'react'
import { Button, Input, message, Typography, Form, Modal } from 'antd'
import { UserOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import bgImage from '../../../images/mancoImage.png'
import logoImage from '../../../images/Logo.png'

const { Title, Text } = Typography

const Login = () => {
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [forgotVisible, setForgotVisible] = useState(false)
  const [forgotUsername, setForgotUsername] = useState('')
  const [forgotNote, setForgotNote] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const navigate = useNavigate()

  const handleForgotPassword = async () => {
    if (!forgotUsername) {
      message.warning('Please enter your username')
      return
    }
    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername, note: forgotNote }),
      })
      const data = await res.json()
      if (res.ok) {
        message.success('Your request has been submitted. An owner or admin will review it shortly.')
        setForgotVisible(false)
        setForgotUsername('')
        setForgotNote('')
      } else {
        message.error(data.error || 'Something went wrong')
      }
    } catch {
      message.error('Connection error. Is the server running?')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleLogin = async (values) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('Login 500:', data)
        message.error(data.error || data.message || 'Server error')
        return
      }
      login(data)
      navigate(`/dashboard/${data.role}`)
    } catch (e) {
      console.error('Login request failed:', e)
      message.error('Connection error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 44px',
        }}>
          <div style={{ marginBottom: 48 }}>
            <img src={logoImage} alt="Logo" style={{ height: 60, width: 'auto', display: 'block' }} />
          </div>

          <Form layout="vertical" onFinish={handleLogin} autoComplete="off" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ marginBottom: 10 }}>
              <Title level={1} style={{ margin: 0, fontWeight: 700, fontSize: 34, lineHeight: 1.2 }}>Welcome Back! 👋</Title>
              <Text style={{ color: '#8c8c8c', fontSize: 16, display: 'block', marginTop: 8 }}>
                Please enter your details.
              </Text>
            </div>
            <Form.Item name="username" rules={[{ required: true, message: 'Please enter your username' }]} style={{ marginBottom: 24 }}>
              <Input
                prefix={<UserOutlined style={{ color: '#bfbfbf', fontSize: 18 }} />}
                placeholder="Username"
                size="large"
                style={{ borderRadius: 12, height: 56, fontSize: 16, paddingLeft: 14 }}
              />
            </Form.Item>

            <Form.Item name="password" rules={[{ required: true, message: 'Please enter your password' }]} style={{ marginBottom: 32 }}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf', fontSize: 18 }} />}
                placeholder="Password"
                size="large"
                style={{ borderRadius: 12, height: 56, fontSize: 16, paddingLeft: 14 }}
              />
            </Form.Item>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Button type="link" style={{ padding: 0, fontSize: 14 }} onClick={() => setForgotVisible(true)}>
                Forgot password?
              </Button>
              <span style={{ color: '#d9d9d9', margin: '0 8px' }}>|</span>
              <Button
                type="link"
                icon={<KeyOutlined />}
                style={{ padding: 0, fontSize: 14 }}
                onClick={() => navigate('/reset-with-code')}
              >
                I have a reset code
              </Button>
            </div>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                style={{ borderRadius: 12, height: 58, fontWeight: 700, fontSize: 17 }}
              >
                Sign in
              </Button>
            </Form.Item>
          </Form>

          <Modal
            title="Reset Password"
            open={forgotVisible}
            onCancel={() => { setForgotVisible(false); setForgotUsername(''); setForgotNote('') }}
            footer={[
              <Button key="cancel" onClick={() => { setForgotVisible(false); setForgotUsername(''); setForgotNote('') }}>Cancel</Button>,
              <Button key="send" type="primary" loading={forgotLoading} onClick={handleForgotPassword}>
                Submit Reset Request
              </Button>,
            ]}
          >
            <div style={{ padding: '16px 0' }}>
              <Text style={{ display: 'block', marginBottom: 16, color: '#666' }}>
                Enter your username and an owner or admin will review your request and provide a reset code.
              </Text>
              <Input
                prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="Your username"
                value={forgotUsername}
                onChange={(e) => setForgotUsername(e.target.value)}
                size="large"
                style={{ borderRadius: 8, height: 48, marginBottom: 12 }}
                onPressEnter={handleForgotPassword}
              />
              <Input.TextArea
                placeholder="Optional note (e.g., reason for reset)"
                value={forgotNote}
                onChange={(e) => setForgotNote(e.target.value)}
                rows={2}
                style={{ borderRadius: 8 }}
              />
            </div>
          </Modal>
        </div>

        <div style={{
          padding: '20px 44px',
          textAlign: 'center',
          borderTop: '1px solid #f0f0f0',
        }}>
          <Text style={{ color: '#8c8c8c', fontSize: 13 }}>
            &copy; {new Date().getFullYear()} Manco (MCM) Trading. All rights reserved.
          </Text>
        </div>
      </div>

      <div style={{
        flex: 3,
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }} />
    </div>
  )
}

export default Login
