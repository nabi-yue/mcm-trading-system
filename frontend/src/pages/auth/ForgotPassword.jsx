import { Card, Button, Input, message, Typography, Form, Space } from 'antd'
import { UserOutlined, ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

const { Title, Text } = Typography
const { TextArea } = Input

const ForgotPassword = () => {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (values) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: values.username, note: values.note || '' }),
      })
      const data = await res.json()
      if (res.ok) {
        message.success('Your request has been submitted. An owner or admin will review it shortly.')
        navigate('/login')
      } else {
        message.error(data.error || 'Failed to submit request')
      }
    } catch {
      message.error('Connection error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5'
    }}>
      <Card
        style={{ width: 420, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
        styles={{ body: { padding: '40px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0 }}>Forgot Password</Title>
          <Text type="secondary">Enter your username to request a password reset</Text>
        </div>
        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Please enter your username' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Your username" size="large" />
          </Form.Item>
          <Form.Item name="note">
            <TextArea
              prefix={<EditOutlined />}
              placeholder="Optional note for the admin (e.g., reason for request)"
              size="large"
              rows={3}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ borderRadius: 8 }}>
              Submit Reset Request
            </Button>
          </Form.Item>
        </Form>
        <Space style={{ width: '100%', justifyContent: 'center' }}>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/login')}>
            Back to Login
          </Button>
        </Space>
      </Card>
    </div>
  )
}

export default ForgotPassword
