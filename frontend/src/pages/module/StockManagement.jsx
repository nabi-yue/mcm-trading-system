import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Table, Card, Typography, Row, Col, Input, Select, Button,
  Tag, Modal, Statistic, Space, Descriptions, Form, InputNumber,
  DatePicker, Spin, Segmented, Checkbox, Dropdown,
} from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../../context/AuthContext.jsx';
import { FABRIC_CATEGORY, fmtQty } from '../../utils/format.js';
import { EllipsisOutlined, RightCircleOutlined } from '@ant-design/icons';
import QtyInput from '../../components/QtyInput.jsx';
import logoImage from '../../../images/Logo.png';
import receiptConfig from '../../config/receipt.json';

const { Search, TextArea } = Input;

const getStockStatus = (qty) => {
  const n = Number(qty);
  if (n === 0) return { tag: <Tag color="red">Out of Stock</Tag>, label: 'out' };
  if (n <= 10) return { tag: <Tag color="orange">Low Stock</Tag>, label: 'low' };
  return { tag: <Tag color="green">In Stock</Tag>, label: 'in' };
};

const adjustmentReasons = ['Restock', 'Damaged', 'Correction', 'Sample', 'Sales Return'];

const StockManagement = () => {
  const { user, can, selectedLocationId, isStorehouse, setSelectedLocationId, setIsStorehouse } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailVisible, setDetailVisible] = useState(false);
  const [adjustVisible, setAdjustVisible] = useState(false);
  const [transferVisible, setTransferVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [fromLocationId, setFromLocationId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [storehouse, setStorehouse] = useState(null);
  const [reorderVisible, setReorderVisible] = useState(false);
  const [reorderForm] = Form.useForm();
  const [adjustForm] = Form.useForm();
  const [transferForm] = Form.useForm();
  const [requestPreset, setRequestPreset] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [movementsCache, setMovementsCache] = useState({});
  const [stats, setStats] = useState({ total_items: 0, low_stock_count: 0, out_of_stock_count: 0, pending_request_count: 0 });
  const [sortBy, setSortBy] = useState('quantity');
  const [sortOrder, setSortOrder] = useState('asc');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectRestockVisible, setSelectRestockVisible] = useState(false);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [selectedRestockIds, setSelectedRestockIds] = useState(new Set());
  const [restockQuantities, setRestockQuantities] = useState({});
  const [orderSummaryVisible, setOrderSummaryVisible] = useState(false);
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [requestLogVisible, setRequestLogVisible] = useState(false);
  const [requestLogs, setRequestLogs] = useState([]);
  const [requestLogLoading, setRequestLogLoading] = useState(false);
  const [reorderSourceId, setReorderSourceId] = useState(null);
  const [branchNeeds, setBranchNeeds] = useState([]);
  const [branchNeedsLoading, setBranchNeedsLoading] = useState(false);
  const [storehousePendingRequests, setStorehousePendingRequests] = useState([]);
  const [storehousePendingLoading, setStorehousePendingLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [storehouseStockFilter, setStorehouseStockFilter] = useState('all');
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const receiptCaptureRef = useRef(null);

  const fetchData = async (page = 1, size = pageSize) => {
    if (!user) return;
    setLoading(true);
    try {
      const locationParam = selectedLocationId !== "all" ? `&location_id=${selectedLocationId}` : '';
      const userIdParam = `&user_id=${user.user_id}`;
      const searchParam = searchText ? `&q=${encodeURIComponent(searchText)}` : '';
      const sortParam = `&sort_by=${sortBy}&sort_order=${sortOrder}`;
      const statusParam = statusFilter ? `&status=${statusFilter}` : '';

      const [invRes, locRes, countRes] = await Promise.all([
        fetch(`/api/inventory?usertype=${user.usertype}${locationParam}${userIdParam}&page=${page}&limit=${size}${searchParam}${sortParam}${statusParam}`),
        fetch(`/api/locations?usertype=${user.usertype}`),
        fetch(`/api/inventory/counts?usertype=${user.usertype}${locationParam}${userIdParam}`),
      ]);
      const invData = await invRes.json();
      const locData = await locRes.json();
      const countData = await countRes.json();

      if (invData.success) {
        const raw = invData.data.data || [];
        const groups = {};
        for (const row of raw) {
          const key = `${row.product_id}-${row.location_id}`;
          if (!groups[key]) groups[key] = { parent: null, varieties: [] };
          if (row.variety_id && (row.color || row.pattern)) {
            groups[key].varieties.push(row);
          } else {
            groups[key].parent = row;
          }
        }
        const merged = [];
        for (const g of Object.values(groups)) {
          if (g.parent) {
            g.parent.varietiesList = g.varieties;
            if (g.varieties.length > 0) {
              g.parent.quantity = g.varieties.reduce((sum, v) => sum + (v.quantity || 0), 0);
            }
            merged.push(g.parent);
          } else if (g.varieties.length > 0) {
            g.varieties[0].varietiesList = g.varieties;
            g.varieties[0].quantity = g.varieties.reduce((sum, v) => sum + (v.quantity || 0), 0);
            merged.push(g.varieties[0]);
          }
        }
        setInventory(merged);
        setTotalCount(invData.data.total_count || 0);
      }
      if (countData.success) {
        setStats(countData.data);
      }
    if (locData.success) {
      const activeLocs = locData.data.filter((l) => l.is_active);
      setLocations(activeLocs);
      setStorehouse(activeLocs.find((l) => l.is_storehouse) || null);
      const currentLoc = activeLocs.find((l) => l.location_id === Number(selectedLocationId));
    }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to load data', centered: true });
    } finally {
      setLoading(false);
    }
  };

  const fetchBranchNeeds = async () => {
    setBranchNeedsLoading(true);
    try {
      const res = await fetch(`/api/inventory/branch-needs?usertype=${user.usertype}`);
      const data = await res.json();
      if (data.success) setBranchNeeds(data.data || []);
    } catch {}
    setBranchNeedsLoading(false);
  };

  const fetchStorehousePendingRequests = async () => {
    setStorehousePendingLoading(true);
    try {
      const locId = storehouse?.location_id;
      if (!locId) return;
      const res = await fetch(`/api/inventory/pending-requests?location_id=${locId}`);
      const data = await res.json();
      if (data.success) setStorehousePendingRequests(data.data || []);
    } catch {}
    setStorehousePendingLoading(false);
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/inventory/request-stock/${requestId}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usertype: user.usertype }),
      });
      const data = await res.json();
      if (data.success) {
        Modal.success({ title: 'Success', content: 'Request accepted', centered: true });
        fetchStorehousePendingRequests();
        fetchData();
      } else {
        Modal.error({ title: 'Error', content: data.message || 'Failed to accept request', centered: true });
      }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to accept request', centered: true });
    }
  };

  const handleDeclineRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/inventory/request-stock/${requestId}/decline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usertype: user.usertype }),
      });
      const data = await res.json();
      if (data.success) {
        Modal.success({ title: 'Success', content: 'Request declined', centered: true });
        fetchStorehousePendingRequests();
      } else {
        Modal.error({ title: 'Error', content: data.message || 'Failed to decline request', centered: true });
      }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to decline request', centered: true });
    }
  };

  useEffect(() => {
    if (isStorehouse) {
      fetchBranchNeeds();
      fetchStorehousePendingRequests();
    }
  }, [isStorehouse, selectedLocationId, storehouse]);

  useEffect(() => {
    if (isStorehouse) {
      setLoading(false);
      return;
    }
    setCurrentPage(1);
    setMovementsCache({});
    fetchData(1);
  }, [user, selectedLocationId, statusFilter, searchText, isStorehouse]);

  const handleViewDetails = async (record) => {
    setSelectedRecord(record);
    if (movementsCache[record.product_id]) {
      setMovements(movementsCache[record.product_id]);
    } else {
      try {
        const res = await fetch(`/api/inventory/movements?usertype=${user.usertype}&product_id=${record.product_id}`);
        const data = await res.json();
        const result = data.success ? data.data : [];
        setMovements(result);
        setMovementsCache((prev) => ({ ...prev, [record.product_id]: result }));
      } catch {
        setMovements([]);
      }
    }
    setDetailVisible(true);
  };

  const handleAdjustStock = (record) => {
    if (selectedLocationId === "all") {
      Modal.warning({ title: 'Warning', content: 'Select a specific branch from the top bar to adjust stock', centered: true });
      return;
    }
    setSelectedRecord(record);
    setRequestPreset(false);
    adjustForm.resetFields();
    setAdjustVisible(true);
  };

  const handleRequestStock = (record) => {
    if (selectedLocationId === "all") {
      Modal.warning({ title: 'Warning', content: 'Select a specific branch from the top bar to request stock', centered: true });
      return;
    }
    setSelectedRecord(record);
    setRequestPreset(true);
    adjustForm.resetFields();
    adjustForm.setFieldsValue({ adjustmentType: 'in', reason: 'Restock' });
    setAdjustVisible(true);
  };

  const handleTransferStock = (record) => {
    setSelectedRecord(record);
    setFromLocationId(record.location_id);
    transferForm.resetFields();
    transferForm.setFieldsValue({ from_location_id: record.location_id, date: dayjs() });
    setTransferVisible(true);
  };

  const handleSetReorder = (record) => {
    setSelectedRecord(record);
    setReorderSourceId(record.auto_restock_source_id || null);
    reorderForm.resetFields();
    reorderForm.setFieldsValue({ reorder_level: record.reorder_level ? Number(record.reorder_level) : 0 });
    setReorderVisible(true);
  };

  const handleReorderSave = async () => {
    try {
      const values = await reorderForm.validateFields();
      const res = await fetch(`/api/products/${selectedRecord.product_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usertype: user.usertype,
          user_id: user.user_id,
          reorder_level: values.reorder_level ? String(values.reorder_level) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const prevSource = selectedRecord.auto_restock_source_id || null;
        if (values.source_branch && values.source_branch !== prevSource) {
          await fetch(`/api/products/${selectedRecord.product_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              usertype: user.usertype,
              auto_restock_source_id: values.source_branch,
            }),
          });
        }
        Modal.success({ title: 'Success', content: 'Reorder level updated', centered: true });
        setReorderVisible(false);
        fetchData();
      } else {
        Modal.error({ title: 'Error', content: data.message, centered: true });
      }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to update reorder level', centered: true });
    }
  };

  const handleAdjustSave = async () => {
    if (adjustSubmitting) return;
    setAdjustSubmitting(true);
    try {
      const values = await adjustForm.validateFields();

      if (requestPreset) {
        const sourceRes = await fetch(`/api/inventory/product/${selectedRecord.product_id}?usertype=${user.usertype}&location_id=${values.from_location_id}&stock_check=1`);
        const sourceData = await sourceRes.json();
        if (sourceData.success) {
          const sourceInv = sourceData.data.find(i => i.location_id === values.from_location_id);
          const sourceQty = sourceInv?.quantity || 0;
          if (Number(sourceQty) < Number(values.quantity)) {
            setAdjustSubmitting(false);
            adjustForm.setFields([{
              name: 'from_location_id',
              errors: [`Insufficient stock at this branch (available: ${fmtQty(sourceQty, selectedRecord?.category === FABRIC_CATEGORY)})`],
            }]);
            return;
          }
        }
        const res = await fetch('/api/inventory/request-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usertype: user.usertype,
            user_id: user.user_id,
            product_id: selectedRecord.product_id,
            from_location_id: values.from_location_id,
            to_location_id: selectedLocationId,
            quantity: values.quantity,
            description: values.remarks || null,
          }),
        });
        const data = await res.json();
        if (data.success) {
          Modal.success({ title: 'Success', content: 'Stock request submitted', centered: true });
          setAdjustVisible(false);
          adjustForm.resetFields();
        } else {
          Modal.error({ title: 'Error', content: data.message, centered: true });
        }
      } else {
        const adjType = values.adjustmentType;
        const reason = values.reason;
        const quantityChange = adjType === 'in'
          ? Math.abs(values.quantity)
          : -Math.abs(values.quantity);

        const res = await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usertype: user.usertype,
            user_id: user.user_id,
            product_id: selectedRecord.product_id,
            location_id: selectedLocationId,
            quantity_change: quantityChange,
            reason,
          }),
        });
        const data = await res.json();
        if (data.success) {
          Modal.success({ title: 'Success', content: 'Stock adjusted', centered: true });
          setAdjustVisible(false);
          adjustForm.resetFields();
          fetchData();
        } else {
          Modal.error({ title: 'Error', content: data.message, centered: true });
        }
      }
    } catch (err) {
      if (err?.errorFields) return;
      Modal.error({ title: 'Error', content: requestPreset ? 'Failed to submit stock request' : 'Failed to adjust stock', centered: true });
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleTransferSave = async () => {
    try {
      const values = await transferForm.validateFields();
      const transferDate = values.date ? values.date.toISOString() : new Date().toISOString();

      const res = await fetch('/api/stock/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usertype: user.usertype,
          user_id: user.user_id,
          product_id: selectedRecord.product_id,
          from_location_id: values.from_location_id,
          to_location_id: values.to_location_id,
          quantity: values.quantity,
          transfer_date: transferDate,
          remarks: values.remarks || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Modal.success({ title: 'Success', content: 'Stock transferred', centered: true });
        setTransferVisible(false);
        setFromLocationId(null);
        transferForm.resetFields();
        fetchData();
      } else {
        Modal.error({ title: 'Error', content: data.message || 'Failed to transfer stock', centered: true });
      }
    } catch (err) {
      if (err?.errorFields) return;
      Modal.error({ title: 'Error', content: 'Failed to transfer stock', centered: true });
    }
  };

  const handleBulkRestock = async () => {
    if (!storehouse) {
      Modal.warning({ title: 'Warning', content: 'No storehouse configured. Mark a location as storehouse first.', centered: true });
      return;
    }
    if (selectedLocationId === "all") {
      Modal.warning({ title: 'Warning', content: 'Select a specific branch from the top bar to restock', centered: true });
      return;
    }
    setRestocking(true);
    try {
      const res = await fetch('/api/inventory/restock-below-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usertype: user.usertype,
          user_id: user.user_id,
          location_id: selectedLocationId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.data.count > 0) {
          Modal.success({ title: 'Success', content: `Restocked ${json.data.count} product(s) from ${storehouse.name}`, centered: true });
          fetchData();
        } else {
          Modal.info({ title: 'Info', content: 'No products below reorder level', centered: true });
        }
      } else {
        Modal.error({ title: 'Error', content: json.message, centered: true });
      }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to restock', centered: true });
    } finally {
      setRestocking(false);
    }
  };

  const handleOpenSelectRestock = async () => {
    if (selectedLocationId === "all") {
      Modal.warning({ title: 'Warning', content: 'Select a specific branch from the top bar to restock', centered: true });
      return;
    }
    try {
      const res = await fetch(`/api/inventory/low-stock?usertype=${user.usertype}&location_id=${selectedLocationId}&user_id=${user.user_id}`);
      const data = await res.json();
      if (data.success) {
        const raw = data.data || [];
        const grouped = {};
        for (const row of raw) {
          const pid = row.product_id;
          if (!grouped[pid]) {
            grouped[pid] = { ...row, quantity: 0 };
          }
          grouped[pid].quantity += row.quantity || 0;
        }
        const deduped = Object.values(grouped);
        setLowStockItems(deduped);
        const defaultQtys = {};
        deduped.forEach((item) => {
          const deficit = Math.max(0, (item.reorder_level || 0) - item.quantity);
          defaultQtys[item.product_id] = deficit > 0 ? deficit + Math.ceil(deficit / 2) : 0;
        });
        setRestockQuantities(defaultQtys);
        setSelectedRestockIds(new Set());
      } else {
        Modal.error({ title: 'Error', content: data.message || 'Failed to load low stock items', centered: true });
      }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to load low stock items', centered: true });
    }
    setSelectRestockVisible(true);
  };

  const fetchRequestLogs = async () => {
    setRequestLogLoading(true);
    try {
      const res = await fetch(`/api/inventory/request-logs?usertype=${user.usertype}&user_id=${user.user_id}`);
      const data = await res.json();
      if (data.success) {
        setRequestLogs(data.data || []);
      }
    } catch {}
    setRequestLogLoading(false);
    setRequestLogVisible(true);
  };

  const handleToggleRestockItem = (productId) => {
    setSelectedRestockIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSelectAllRestock = (checked) => {
    if (checked) {
      setSelectedRestockIds(new Set(lowStockItems.map((i) => i.product_id)));
    } else {
      setSelectedRestockIds(new Set());
    }
  };

  const handleRestockQtyChange = (productId, value) => {
    setRestockQuantities((prev) => ({ ...prev, [productId]: value }));
  };

  const handleOrderRestock = () => {
    if (selectedRestockIds.size === 0) {
      Modal.warning({ title: 'Warning', content: 'Select at least one item to restock', centered: true });
      return;
    }
    setOrderSummaryVisible(true);
  };

  const handleConfirmRestock = async () => {
    const items = [];
    for (const productId of selectedRestockIds) {
      const qty = restockQuantities[productId] || 0;
      if (qty > 0) {
        items.push({ product_id: productId, quantity: qty });
      }
    }
    if (items.length === 0) {
      Modal.warning({ title: 'Warning', content: 'All selected items have zero quantity', centered: true });
      return;
    }

    const unavailable = items.filter((item) => {
      const ls = lowStockItems.find((i) => i.product_id === item.product_id);
      return !ls || (ls.storehouse_quantity || 0) < item.quantity;
    });
    if (unavailable.length > 0) {
      const names = unavailable.map((i) => {
        const ls = lowStockItems.find((ls) => ls.product_id === i.product_id);
        return ls?.product_name || `Product #${i.product_id}`;
      }).join(', ');
      Modal.error({ title: 'Error', content: `Insufficient storehouse stock for: ${names}`, centered: true });
      return;
    }

    setRestockSubmitting(true);
    try {
      const res = await fetch('/api/inventory/restock-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usertype: user.usertype,
          user_id: user.user_id,
          location_id: selectedLocationId,
          items,
        }),
      });
      const json = await res.json();
      if (json.success) {
        Modal.success({ title: 'Success', content: `Restock request submitted for ${json.data.count} product(s) — waiting for storehouse approval`, centered: true });
        setOrderSummaryVisible(false);
        setSelectRestockVisible(false);
        setSelectedRestockIds(new Set());
        fetchData();
      } else {
        Modal.error({ title: 'Error', content: json.message, centered: true });
      }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to submit restock request', centered: true });
    } finally {
      setRestockSubmitting(false);
    }
  };

  const handlePrintSummary = async () => {
    if (!receiptCaptureRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(receiptCaptureRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });
    const link = document.createElement('a');
    link.download = 'restock-receipt.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const { total_items: totalItems, low_stock_count: lowStockCount, out_of_stock_count: outOfStockCount, pending_request_count: pendingRequestCount } = stats;

  const showBranch = selectedLocationId === "all";
  const receiptItems = lowStockItems.filter((i) => selectedRestockIds.has(i.product_id) && (restockQuantities[i.product_id] || 0) > 0);
  const receiptTotalQty = receiptItems.reduce((sum, i) => sum + (restockQuantities[i.product_id] || 0), 0);
  const receiptRef = `RS-${Date.now().toString(36).toUpperCase()}`;

  const columns = [
    {
      title: 'Product Name', dataIndex: 'product_name', key: 'product_name',
      sorter: true,
      defaultSortOrder: sortBy === 'product_name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    ...(showBranch ? [{
      title: 'Branch', dataIndex: 'location_name', key: 'location_name',
      sorter: true,
    }] : []),
    {
      title: 'Current Stock Quantity', dataIndex: 'quantity', key: 'quantity',
      render: (qty, record) => {
        const varieties = record.varietiesList;
        if (varieties && varieties.length > 0) {
          const isExpanded = expandedRowKeys.includes(record.inventory_id);
          return (
            <span>
              <span style={{ fontSize: 10, marginRight: 4, cursor: 'pointer' }} onClick={() => {
                setExpandedRowKeys((prev) =>
                  isExpanded ? prev.filter((id) => id !== record.inventory_id) : [...prev, record.inventory_id]
                );
              }}>{isExpanded ? '▼' : '▶'}</span>
              {fmtQty(qty, record.category === FABRIC_CATEGORY)}
            </span>
          );
        }
        return fmtQty(qty, record.category === FABRIC_CATEGORY);
      },
      sorter: true,
    },
    {
      title: 'Stock Status',
      dataIndex: 'quantity',
      key: 'stockStatus',
      render: (qty, record) => {
        const varieties = record.varietiesList;
        if (varieties && varieties.length > 0) {
          const n = Number(qty);
          const rl = Number(record.reorder_level) || 0;
          if (n === 0) return <Tag color="red">Out of Stock</Tag>;
          if (rl > 0 && n < rl) return <Tag color="orange">Low Stock</Tag>;
          return <Tag color="green">In Stock</Tag>;
        }
        return getStockStatus(qty).tag;
      },
      sorter: true,
    },
    {
      title: 'Reorder Level', dataIndex: 'reorder_level', key: 'reorder_level',
      render: (val) => (val ? Number(val).toLocaleString() : '-'),
      sorter: true,
    },
    {
      title: 'Auto-Restock',
      key: 'autoRestock',
      render: (_, record) => {
        const level = Number(record.reorder_level) || 0;
        const sourceId = record.auto_restock_source_id;
        const source = locations.find((l) => l.location_id === sourceId);
        return level > 0 && sourceId
          ? <Tag color="green">{source?.name || 'Source Set'}</Tag>
          : <Tag>{sourceId ? 'Inactive' : 'No Source Set'}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              ...(can('update') ? [{
                key: 'request',
                label: 'Request',
                disabled: selectedLocationId === 'all',
                onClick: () => handleRequestStock(record),
              }] : []),
              ...(can('update') ? [{
                key: 'reorder',
                label: 'Reorder',
                disabled: selectedLocationId === 'all',
                onClick: () => handleSetReorder(record),
              }] : []),
              ...(can('update') ? [{
                key: 'adjust',
                label: 'Adjust',
                disabled: selectedLocationId === 'all',
                onClick: () => handleAdjustStock(record),
              }] : []),
              ...(can('update') ? [{
                key: 'transfer',
                label: 'Transfer',
                disabled: selectedLocationId === 'all' || record.quantity === 0,
                onClick: () => handleTransferStock(record),
              }] : []),
              {
                key: 'details',
                label: 'Details',
                onClick: () => handleViewDetails(record),
              },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<EllipsisOutlined style={{ fontSize: 18, transform: 'rotate(90deg)' }} />} />
        </Dropdown>
      ),
    },
  ];

  const movementColumns = [
    {
      title: 'Date', dataIndex: 'date', key: 'date',
      sorter: (a, b) => new Date(a.date) - new Date(b.date),
    },
    {
      title: 'Type', dataIndex: 'type', key: 'type',
      render: (type) => {
        const labels = { adjustment: 'Adjustment', transfer_out: 'Transfer Out', transfer_in: 'Transfer In' };
        return labels[type] || type;
      },
      sorter: (a, b) => (a.type || '').localeCompare(b.type || ''),
    },
    {
      title: 'Quantity Change', dataIndex: 'quantity_change', key: 'quantity_change',
      render: (val) => {
        const isFab = selectedRecord?.category === FABRIC_CATEGORY;
        const display = fmtQty(Math.abs(val), isFab);
        return (
          <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f' }}>
            {val >= 0 ? `+${display}` : val === 0 ? display : `-${display}`}
          </span>
        );
      },
      sorter: (a, b) => a.quantity_change - b.quantity_change,
    },
    {
      title: 'Location', dataIndex: 'location_name', key: 'location_name',
      sorter: (a, b) => (a.location_name || '').localeCompare(b.location_name || ''),
    },
    {
      title: 'Reason / Remarks', dataIndex: 'remarks', key: 'remarks', render: (v) => v || '-',
      sorter: (a, b) => (a.remarks || '').localeCompare(b.remarks || ''),
    },
  ];

  if (loading && inventory.length === 0) return <Card style={{ textAlign: 'center' }}><Spin size="large" /></Card>;

  const visibleColumns = selectedLocationId === 'all'
    ? columns
    : columns.filter(col => col.key !== 'location_name');

  const restockFooterItems = orderSummaryVisible
    ? [
      <Button key="print" style={{ background: '#1677ff', borderColor: '#1677ff', color: '#fff' }} onClick={handlePrintSummary}>Download Receipt</Button>,
      <Button key="cancel" danger onClick={() => { setOrderSummaryVisible(false); }}>Cancel</Button>,
      <Button key="confirm" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} loading={restockSubmitting} onClick={handleConfirmRestock}>Confirm</Button>,
    ]
    : [
      <Button key="cancel" onClick={() => { setSelectRestockVisible(false); setOrderSummaryVisible(false); }}>Cancel</Button>,
      <Button key="order" type="primary" onClick={handleOrderRestock}>Order</Button>,
    ];

  return (
    <div>
      <Card styles={{ body: { padding: '16px 24px' } }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card style={{ height: '100%' }} styles={{ body: { padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' } }}>
            <Statistic title="Total Stock Items" value={totalItems} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ height: '100%' }} styles={{ body: { display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' } }}>
            <Statistic title="Low Stock Items" value={lowStockCount} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ height: '100%' }} styles={{ body: { display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' } }}>
            <Statistic title="Out of Stock Items" value={outOfStockCount} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ height: '100%' }}>
            {isStorehouse ? (
              <Card
                hoverable
                onClick={() => { setRequestLogVisible(true); fetchStorehousePendingRequests(); }}
                style={{ height: '100%' }}
                styles={{ body: { padding: '20px 24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' } }}
                loading={storehousePendingLoading}
              >
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                  <Statistic title="Pending Requests" value={storehousePendingRequests.length} valueStyle={{ color: '#1677ff' }} />
                  <Button
                    type="link"
                    size="small"
                    icon={<RightCircleOutlined />}
                    style={{ padding: 0, marginTop: 8, fontSize: 13 }}
                  >
                    View & Manage Requests
                  </Button>
                </div>
              </Card>
            ) : (
              <Card
                hoverable
                onClick={fetchRequestLogs}
                style={{ height: '100%' }}
                styles={{ body: { padding: '20px 24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' } }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                  <Statistic title="Current Requested" value={pendingRequestCount} valueStyle={{ color: '#1677ff' }} />
                  <Button
                    type="link"
                    size="small"
                    icon={<RightCircleOutlined />}
                    style={{ padding: 0, marginTop: 8, fontSize: 13 }}
                  >
                    View Request Logs
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </Col>
      </Row>

      {storehouse && (
        <Card size="small" style={{ marginBottom: 16, background: 'rgba(82, 196, 26, 0.08)', borderColor: 'rgba(82, 196, 26, 0.3)' }}>
          <Space>
            <Tag color="green">Storehouse</Tag>
            <span><strong>{storehouse.name}</strong></span>
          </Space>
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={14}>
          <Space wrap>
            {isStorehouse ? (
              <Space>
                <Search
                  placeholder="Search products..."
                  value={searchText}
                  onChange={(e) => { setSearchText(e.target.value); fetchBranchNeeds(); }}
                  allowClear
                  style={{ width: 200 }}
                />
                <Select
                  placeholder="Filter by branch"
                  value={branchFilter}
                  onChange={setBranchFilter}
                  style={{ width: 160 }}
                  allowClear={false}
                >
                  <Select.Option value="all">All Branches</Select.Option>
                  {locations.filter((l) => l.location_id !== storehouse?.location_id).map((l) => (
                    <Select.Option key={l.location_id} value={String(l.location_id)}>{l.name}</Select.Option>
                  ))}
                </Select>
                <Segmented
                  value={storehouseStockFilter}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'Has Stock', value: 'has_stock' },
                    { label: 'No Stock', value: 'no_stock' },
                  ]}
                  onChange={setStorehouseStockFilter}
                />
              </Space>
            ) : (
              <>
                <Search
                  placeholder="Search by product name"
                  value={searchText}
                  onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
                  allowClear
                  style={{ width: 220 }}
                />
                {user && (user.usertype === 1 || user.usertype === 3) && (
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'all', label: 'All Locations' },
                        ...locations.filter((l) => l.is_active).map(loc => ({ key: String(loc.location_id), label: loc.name })),
                      ],
                      onClick: ({ key }) => {
                        if (key === 'all') {
                          setSelectedLocationId('all');
                          setIsStorehouse(false);
                        } else {
                          setSelectedLocationId(Number(key));
                          const loc = locations.find(l => l.location_id === Number(key));
                          setIsStorehouse(loc ? loc.is_storehouse : false);
                        }
                      },
                    }}
                  >
                    <Button type={selectedLocationId !== 'all' ? 'primary' : 'default'}>
                      {selectedLocationId !== 'all'
                        ? (locations.find(l => l.location_id === Number(selectedLocationId))?.name || 'Branch')
                        : 'All Locations'}
                    </Button>
                  </Dropdown>
                )}
                {can('update') && (
                  <Button type="primary" onClick={handleOpenSelectRestock} disabled={selectedLocationId === "all"}>
                    Select Restock
                  </Button>
                )}
              </>
            )}
          </Space>
        </Col>
      </Row>

      {isStorehouse ? (
        <Table
          scroll={{ x: 'max-content' }}
          dataSource={branchNeeds.filter((r) => {
            if (searchText && !r.product_name.toLowerCase().includes(searchText.toLowerCase())) return false;
            if (branchFilter !== 'all' && String(r.branch_id) !== branchFilter) return false;
            if (storehouseStockFilter === 'has_stock' && !(r.storehouse_qty > 0)) return false;
            if (storehouseStockFilter === 'no_stock' && (r.storehouse_qty > 0)) return false;
            return true;
          })}
          rowKey={(r) => `${r.product_id}-${r.branch_id}`}
          loading={branchNeedsLoading}
          size="middle"
          bordered
          columns={[
            { title: 'Product', dataIndex: 'product_name', key: 'product_name' },
            { title: 'Branch', dataIndex: 'branch_name', key: 'branch_name' },
            {
              title: 'Current Qty', dataIndex: 'current_qty', key: 'current_qty',
              render: (v, r) => fmtQty(v, r.category === FABRIC_CATEGORY),
            },
            {
              title: 'Reorder Level', dataIndex: 'reorder_level', key: 'reorder_level',
              render: (v) => Number(v).toLocaleString(),
            },
            {
              title: 'Deficit', dataIndex: 'deficit', key: 'deficit',
              render: (v, r) => <span style={{ color: '#ff4d4f' }}>{fmtQty(v, r.category === FABRIC_CATEGORY)}</span>,
            },
            {
              title: 'Storehouse Stock', key: 'storehouseQty',
              render: (_, r) => {
                const sq = r.storehouse_qty || 0;
                return sq > 0
                  ? <span style={{ color: '#52c41a' }}>{fmtQty(sq, r.category === FABRIC_CATEGORY)}</span>
                  : <Tag color="red">No Stock</Tag>;
              },
            },
          ]}
          locale={{ emptyText: 'All branches are adequately stocked' }}
          pagination={{ pageSize: 10 }}
        />
      ) : (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Segmented
              value={statusFilter || 'all'}
              options={[
                { label: 'All', value: 'all' },
                { label: `In Stock (${stats.total_items - stats.low_stock_count - stats.out_of_stock_count})`, value: 'in_stock' },
                { label: `Low Stock (${stats.low_stock_count})`, value: 'low_stock' },
                { label: `Out of Stock (${stats.out_of_stock_count})`, value: 'out_of_stock' },
              ]}
              onChange={(val) => setStatusFilter(val === 'all' ? '' : val)}
            />
          </Space>
          <Table
            dataSource={inventory}
            columns={visibleColumns}
            rowKey="inventory_id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            rowClassName={(record) => {
              const q = Number(record.quantity);
              if (q === 0) return 'row-out-of-stock';
              if (q <= 10) return 'row-low-stock';
              return '';
            }}
            expandable={{
              expandedRowRender: (record) => {
                const varieties = record.varietiesList;
                if (!varieties || varieties.length === 0) return null;
                return (
                  <div style={{ padding: '8px 0 8px 40px' }}>
                    {varieties.map((v) => (
                      <div key={v.variety_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0', fontSize: 13 }}>
                        {v.color && (
                          <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: v.color === 'White' ? '#ddd' : v.color, display: 'inline-block', border: '1px solid #d9d9d9' }} />
                        )}
                        <span style={{ width: 100 }}>{v.pattern || 'Default'}</span>
                        <span style={{ color: '#888' }}>{v.color || ''}</span>
                        <Tag>{fmtQty(v.quantity, record.category === FABRIC_CATEGORY)}</Tag>
                      </div>
                    ))}
                  </div>
                );
              },
              expandedRowKeys,
              onExpand: (expanded, record) => {
                setExpandedRowKeys((prev) =>
                  expanded ? [...prev, record.inventory_id] : prev.filter((id) => id !== record.inventory_id)
                );
              },
              showExpandColumn: false,
            }}
            onChange={(pagination, filters, sorter) => {
              if (sorter.field) {
                const newSortBy = sorter.field;
                const newSortOrder = sorter.order === 'descend' ? 'desc' : 'asc';
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
                fetchData(1);
              }
            }}
            pagination={{
              current: currentPage, pageSize, total: totalCount,
              showSizeChanger: true,
              pageSizeOptions: [10, 25, 50, 100],
              onShowSizeChange: (_, size) => {
                setPageSize(size);
                setCurrentPage(1);
                fetchData(1, size);
              },
              onChange: (p) => {
                setCurrentPage(p);
                fetchData(p);
              },
            }}
          />
        </>
      )}

      <Modal
        title={`${selectedRecord?.product_name} - Stock Details`}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[<Button key="close" type="primary" onClick={() => setDetailVisible(false)}>Close</Button>]}
        width={800}
        centered
      >
        <Descriptions column={2} bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Product Name">{selectedRecord?.product_name}</Descriptions.Item>
          <Descriptions.Item label="SKU">{selectedRecord?.sku}</Descriptions.Item>
          <Descriptions.Item label="Branch">{selectedRecord?.location_name}</Descriptions.Item>
          <Descriptions.Item label="Current Stock Quantity">{fmtQty(selectedRecord?.quantity, selectedRecord?.category === FABRIC_CATEGORY, selectedRecord?.category === FABRIC_CATEGORY ? 'yds' : 'pcs')}</Descriptions.Item>
          <Descriptions.Item label="Reorder Level">{selectedRecord?.reorder_level ? Number(selectedRecord.reorder_level).toLocaleString() : 'Not set'}</Descriptions.Item>
        </Descriptions>

        <Typography.Text strong style={{ marginBottom: 8, display: 'block' }}>
          Stock Movement History
        </Typography.Text>
        <Table
          dataSource={movements}
          columns={movementColumns}
          rowKey={(row, idx) => `${row.type}-${idx}`}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          bordered
        />
      </Modal>

      <Modal
        title={`Set Reorder Level - ${selectedRecord?.product_name}`}
        open={reorderVisible}
        onCancel={() => setReorderVisible(false)}
        centered
        footer={[
          <Button key="cancel" onClick={() => setReorderVisible(false)}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleReorderSave}>Save</Button>,
        ]}
      >
        <Form form={reorderForm} layout="vertical">
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Set the minimum stock threshold and choose which branch to auto-restock from when stock drops below this level.
          </Typography.Text>
          <Form.Item name="reorder_level" label="Reorder Level" rules={[{ required: true, message: 'Please enter reorder level' }]}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="Enter minimum stock level" />
          </Form.Item>
          <Form.Item name="source_branch" label="Auto-Restock Source Branch" initialValue={reorderSourceId}>
            <Select placeholder="Select source branch" allowClear>
              {locations.filter((l) => l.location_id !== selectedLocationId).map((loc) => (
                <Select.Option key={loc.location_id} value={loc.location_id}>{loc.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={requestPreset ? `Request Stock - ${selectedRecord?.product_name}` : `Adjust Stock - ${selectedRecord?.product_name}`}
        open={adjustVisible}
        onCancel={() => setAdjustVisible(false)}
        centered
        footer={[
          <Button key="cancel" onClick={() => setAdjustVisible(false)}>Cancel</Button>,
          <Button key="save" type="primary" loading={adjustSubmitting} onClick={handleAdjustSave}>{requestPreset ? 'Submit Request' : 'Save'}</Button>,
        ]}
      >
        <Form form={adjustForm} layout="vertical">
          {requestPreset ? (
            <>
              <Typography.Text style={{ display: 'block', marginBottom: 16 }}>
                Request stock from another branch to your current location.
              </Typography.Text>
              <Form.Item name="from_location_id" label="Source Branch" rules={[{ required: true, message: 'Please select source branch' }]}>
                <Select placeholder="Select branch to request from">
                  {locations.filter((loc) => loc.location_id !== selectedLocationId).map((loc) => (
                    <Select.Option key={loc.location_id} value={loc.location_id}>{loc.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          ) : (
            <>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                Adjusting stock at selected branch
              </Typography.Text>
              <Typography.Text style={{ display: 'block', marginBottom: 16 }}>
                Current stock: <strong>{fmtQty(selectedRecord?.quantity, selectedRecord?.category === FABRIC_CATEGORY)} {selectedRecord?.category === FABRIC_CATEGORY ? 'yards' : 'units'}</strong>
              </Typography.Text>
              <Form.Item name="adjustmentType" label="Adjustment Type" rules={[{ required: true, message: 'Please select adjustment type' }]}>
                <Select placeholder="Select type">
                  <Select.Option value="in">Stock In (+)</Select.Option>
                  <Select.Option value="out">Stock Out (-)</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Please select a reason' }]}>
                <Select placeholder="Select reason">
                  {adjustmentReasons.map((r) => (
                    <Select.Option key={r} value={r}>{r}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}
          <Form.Item label={`Quantity (${selectedRecord?.category === FABRIC_CATEGORY ? 'yards' : 'units'})`} required>
            <Form.Item name="quantity" noStyle rules={[{ required: true, message: 'Please enter quantity' }]}>
              <QtyInput isFabric={selectedRecord?.category === FABRIC_CATEGORY} />
            </Form.Item>
          </Form.Item>
          <Form.Item name="remarks" label={requestPreset ? 'Description (optional)' : 'Remarks (optional)'}>
            <TextArea rows={2} placeholder={requestPreset ? 'Additional notes for the request' : 'Additional notes'} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Transfer Stock - ${selectedRecord?.product_name}`}
        open={transferVisible}
        onCancel={() => { setTransferVisible(false); setFromLocationId(null); }}
        centered
        footer={[
          <Button key="cancel" onClick={() => { setTransferVisible(false); setFromLocationId(null); }}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleTransferSave}>Save</Button>,
        ]}
      >
        <Form form={transferForm} layout="vertical">
          <Form.Item name="from_location_id" label="From Branch">
            <Select disabled>
              {locations.map((loc) => (
                <Select.Option key={loc.location_id} value={loc.location_id}>{loc.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="to_location_id" label="To Branch" rules={[{ required: true, message: 'Please select destination branch' }]}>
            <Select placeholder="Select destination branch">
              {locations.filter((loc) => loc.location_id !== fromLocationId).map((loc) => (
                <Select.Option key={loc.location_id} value={loc.location_id}>{loc.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label={`Quantity (${selectedRecord?.category === FABRIC_CATEGORY ? 'yards' : 'units'})`} required>
            <Form.Item name="quantity" noStyle rules={[{ required: true, message: 'Please enter quantity' }]}>
              <QtyInput isFabric={selectedRecord?.category === FABRIC_CATEGORY} max={selectedRecord?.quantity || 1} />
            </Form.Item>
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: -16, marginBottom: 16, display: 'block' }}>
            Available: {fmtQty(selectedRecord?.quantity, selectedRecord?.category === FABRIC_CATEGORY)} {selectedRecord?.category === FABRIC_CATEGORY ? 'yards' : 'units'}
          </Typography.Text>
          <Form.Item name="date" label="Transfer Date" rules={[{ required: true, message: 'Please select date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks (optional)">
            <TextArea rows={2} placeholder="Additional notes" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Select Items to Restock"
        open={selectRestockVisible}
        onCancel={() => { setSelectRestockVisible(false); setOrderSummaryVisible(false); }}
        width={950}
        centered
        styles={{ body: { padding: '16px 24px' } }}
        footer={restockFooterItems}
      >
        <div>
          <div style={{ marginBottom: 12 }}>
            <Checkbox
              checked={selectedRestockIds.size > 0 && selectedRestockIds.size === lowStockItems.length}
              indeterminate={selectedRestockIds.size > 0 && selectedRestockIds.size < lowStockItems.length}
              onChange={(e) => handleSelectAllRestock(e.target.checked)}
            >
              Select All
            </Checkbox>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: orderSummaryVisible ? '30vh' : '45vh' }}>
            <Table
              dataSource={lowStockItems}
              rowKey="product_id"
              pagination={false}
              size="small"
              bordered
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: 'Select', key: 'select', width: 60,
                  render: (_, record) => (
                    <Checkbox
                      checked={selectedRestockIds.has(record.product_id)}
                      onChange={() => handleToggleRestockItem(record.product_id)}
                    />
                  ),
                },
                { title: 'Product Name', dataIndex: 'product_name', key: 'product_name', sorter: (a, b) => a.product_name.localeCompare(b.product_name) },
                { title: 'Category', dataIndex: 'category', key: 'category', sorter: (a, b) => (a.category || '').localeCompare(b.category || '') },
                {
                  title: 'Status', key: 'status', width: 130,
                  sorter: (a, b) => a.quantity - b.quantity,
                  render: (_, record) => getStockStatus(record.quantity).tag,
                },
                {
                  title: 'Current Quantity', dataIndex: 'quantity', key: 'quantity', width: 110,
                  sorter: (a, b) => a.quantity - b.quantity,
                  render: (qty, record) => fmtQty(qty, record.category === FABRIC_CATEGORY),
                },
                {
                  title: 'Storehouse Stock', key: 'storehouseStock', width: 110,
                  render: (_, record) => {
                    const sq = record.storehouse_quantity || 0;
                    return sq > 0
                      ? <span style={{ color: '#52c41a' }}>{fmtQty(sq, record.category === FABRIC_CATEGORY)}</span>
                      : <Tag color="red">No Stock</Tag>;
                  },
                },
                {
                  title: 'Restock Quantity', key: 'restockQty', width: 175,
                  render: (_, record) => (
                    <QtyInput
                      isFabric={record.category === FABRIC_CATEGORY}
                      value={restockQuantities[record.product_id] || 0}
                      disabled={!selectedRestockIds.has(record.product_id)}
                      min={0}
                      onChange={(val) => handleRestockQtyChange(record.product_id, val || 0)}
                    />
                  ),
                },
              ]}
            />
          </div>
          {orderSummaryVisible && (
            <div
              id="restock-summary-content"
              style={{
                marginTop: 16,
                borderTop: '1px solid #f0f0f0',
                paddingTop: 16,
              }}
            >
              <Typography.Title level={5} style={{ marginTop: 0 }}>Order Summary</Typography.Title>
              <Table
                dataSource={lowStockItems.filter((i) => selectedRestockIds.has(i.product_id) && (restockQuantities[i.product_id] || 0) > 0)}
                rowKey="product_id"
                pagination={false}
                size="small"
                bordered
                scroll={{ x: 'max-content' }}
                columns={[
                  { title: 'Product', dataIndex: 'product_name', key: 'product_name' },
                  { title: 'Category', dataIndex: 'category', key: 'category' },
                  {
                    title: 'Current Qty', dataIndex: 'quantity', key: 'quantity', width: 100,
                    render: (qty, record) => fmtQty(qty, record.category === FABRIC_CATEGORY),
                  },
                  {
                    title: 'Restock Qty', key: 'restockQty', width: 100,
                    render: (_, record) => fmtQty(restockQuantities[record.product_id] || 0, record.category === FABRIC_CATEGORY),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title={isStorehouse ? "Pending Requests" : "Request Transfer Log"}
        open={requestLogVisible}
        onCancel={() => setRequestLogVisible(false)}
        footer={[<Button key="close" type="primary" onClick={() => setRequestLogVisible(false)}>Close</Button>]}
        width={900}
        centered
      >
        <Table
          dataSource={isStorehouse ? storehousePendingRequests : requestLogs}
          rowKey="request_id"
          loading={isStorehouse ? storehousePendingLoading : requestLogLoading}
          size="small"
          bordered
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Branch', key: 'branch', render: (_, r) => `${r.from_location_name} → ${r.to_location_name}` },
            { title: 'Product', dataIndex: 'product_name', key: 'product' },
            {
              title: 'Quantity', dataIndex: 'quantity', key: 'quantity',
              render: (qty, r) => fmtQty(qty, r.is_fabric),
            },
            {
              title: 'Requested By', key: 'requester',
              render: (_, r) => r.requester_name || '-',
            },
            {
              title: 'Date & Time', dataIndex: 'created_at', key: 'created_at',
              render: (d) => d ? new Date(d).toLocaleString() : '-',
            },
            ...(isStorehouse ? [{
              title: 'Actions', key: 'actions', width: 180,
              render: (_, r) => {
                if (r.status !== 'pending') {
                  const color = r.status === 'accepted' ? 'green' : 'red';
                  return <Tag color={color}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Tag>;
                }
                return (
                  <Space>
                    <Button size="small" danger onClick={() => handleDeclineRequest(r.request_id)}>Decline</Button>
                    <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleAcceptRequest(r.request_id)}>Accept</Button>
                  </Space>
                );
              },
            }] : [{
              title: 'Status', dataIndex: 'status', key: 'status',
              render: (s) => {
                const color = s === 'accepted' ? 'green' : s === 'declined' ? 'red' : 'orange';
                return <Tag color={color}>{s.charAt(0).toUpperCase() + s.slice(1)}</Tag>;
              },
            }]),
          ]}
        />
      </Modal>

      <div id="stock-receipt-print" ref={receiptCaptureRef} style={{ position: 'absolute', left: '-9999px', top: 0, width: 550, background: '#fff', zIndex: -1, padding: 32 }}>
        <div className="receipt-inner" style={{ width: '100%', padding: '24px 24px', fontFamily: "'Courier New', monospace", fontSize: 14, color: '#222', background: '#fff', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <img src={logoImage} alt="Logo" style={{ height: 60, width: 'auto', display: 'block', margin: '0 auto 6px' }} />
            <div className="receipt-header" style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{receiptConfig.companyName}</div>
          </div>
          <div className="receipt-section" style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, padding: '6px 0', borderTop: '2px dashed #888', borderBottom: '2px dashed #888', marginBottom: 12 }}>
            RESTOCK ORDER
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 13 }}>
            <tbody>
              {[['Date:', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
                ['Ref No:', receiptRef],
                ['Branch:', user?.location_name || `Branch #${user?.location_id}`],
                ['Prepared by:', user?.username || '-']].map(([label, value], i) => (
                <tr key={i}>
                  <td className="receipt-label" style={{ padding: '2px 4px', color: '#666' }}>{label}</td>
                  <td className="receipt-label" style={{ padding: '2px 4px', textAlign: 'right' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: '1px dashed #aaa', borderBottom: '1px dashed #aaa', padding: '6px 0', marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 13 }}>
            <span>Item</span>
            <span>Qty</span>
          </div>
          {receiptItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#999' }}>No items selected</div>
          ) : (
            receiptItems.map((item) => (
              <div key={item.product_id} className="receipt-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px dotted #ddd' }}>
                <span style={{ flex: 1, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQty(restockQuantities[item.product_id] || 0, item.category === FABRIC_CATEGORY)}</span>
              </div>
            ))
          )}
          <div className="receipt-totals" style={{ borderTop: '2px dashed #888', marginTop: 8, paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>Total Items:</span>
              <span>{receiptItems.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
              <span>Total Quantity:</span>
              <span>{receiptTotalQty}</span>
            </div>
          </div>
          <div className="receipt-footer" style={{ textAlign: 'center', marginTop: 20, paddingTop: 12, borderTop: '2px dashed #888', fontSize: 13, color: '#555' }}>
            Thank you!
          </div>
        </div>
      </div>
      </Card>
    </div>
  );
};

export default StockManagement;
