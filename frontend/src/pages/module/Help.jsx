import { useState } from 'react'
import { Typography, Input, Row, Col, Card, Collapse, Button, Steps, Space } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  QuestionCircleOutlined, LoginOutlined, AppstoreOutlined,
  CheckCircleOutlined, LogoutOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { Search } = Input

const faqData = [
  {
    header: 'How do I add a new product to inventory?',
    content: 'Navigate to Inventory, click the "Add Product" button, fill in the product name, category, price, and reorder level, then click Save.',
  },
  {
    header: 'How do I void a transaction?',
    content: 'Go to Sales, find the transaction in the table, click "Void" in the Actions column, and confirm with "Yes" on the popup.',
  },
  {
    header: 'How do I change my password?',
    content: 'Go to Settings, open the "Change Password" tab, enter your old password, new password, confirm it, and click "Change Password".',
  },
  {
    header: 'How do I generate a report?',
    content: 'Navigate to Reports, select the desired report type tab (Inventory, Sales, Financial, etc.), apply any filters, and view the generated data.',
  },
  {
    header: 'How do I adjust stock levels?',
    content: 'Go to Stock Management, click the actions menu (⋮) on a product row and select "Adjust", choose Add or Remove, enter the quantity and reason, then click Save.',
  },
  {
    header: 'How do I transfer stock between branches?',
    content: 'Go to Stock Management, click the actions menu (⋮) on a product row and select "Transfer", choose the source and destination branches, enter the quantity, and click Save.',
  },
  {
    header: 'How do I change a user\'s role or location?',
    content: 'Go to User Access (Owner only), click the "Edit" button to enable editing, then change the Role or Location dropdown for the desired user.',
  },
  {
    header: 'How do I switch between light and dark mode?',
    content: 'Go to Settings, under Preferences, change the Theme dropdown to Dark or Light and click "Save Preferences". The change applies immediately.',
  },
]

const Help = () => {
  const [searchText, setSearchText] = useState('')
  const navigate = useNavigate()

  const filteredFaq = faqData.filter(
    (faq) =>
      faq.header.toLowerCase().includes(searchText.toLowerCase()) ||
      faq.content.toLowerCase().includes(searchText.toLowerCase())
  )

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>Help</Title>
      <Text type="secondary" style={{ marginBottom: 24, display: 'block' }}>How can we help you?</Text>

      <Row justify="center" style={{ marginBottom: 24 }}>
        <Col xs={24} md={16} lg={12}>
          <Search
            placeholder="Search through FAQs and user manual..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            enterButton
            size="large"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Frequently Asked Questions" styles={{ header: { borderBottom: '1px solid #f0f0f0' }, body: { padding: 0 } }}>
            <Collapse accordion={false} bordered={false} expandIconPosition="start" items={filteredFaq.map((faq) => ({
              key: faq.header,
              label: <Space><QuestionCircleOutlined style={{ color: '#5b7ff0' }} /><span>{faq.header}</span></Space>,
              children: <Paragraph style={{ margin: 0, paddingLeft: 28 }}>{faq.content}</Paragraph>,
            }))} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="User Manual" styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}>
            <Paragraph>
              The user manual contains full documentation on how to use each module of the system,
              including step-by-step instructions, screenshots, and best practices.
            </Paragraph>
            <Button type="primary" icon={<QuestionCircleOutlined />} onClick={() => navigate('/dashboard/manual')}>
              View User Manual
            </Button>
          </Card>
        </Col>
      </Row>

      <Card title="Quick Guide" style={{ marginTop: 16 }} styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}>
        <Steps
          direction="vertical"
          current={-1}
          items={[
            { title: 'Login', icon: <LoginOutlined />, description: 'Enter your credentials to access the system dashboard.' },
            { title: 'Select Module', icon: <AppstoreOutlined />, description: 'Choose your desired module from the sidebar navigation.' },
            { title: 'Perform Task', icon: <CheckCircleOutlined />, description: 'Complete your task using the available tools, forms, and actions.' },
            { title: 'Logout', icon: <LogoutOutlined />, description: 'Click the Logout button in the top bar to securely end your session.' },
          ]}
        />
      </Card>


    </div>
  )
}

export default Help