import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Table, Card, Typography, Row, Col, Input, Select, Button,
  Tag, Modal, Statistic, Space, Descriptions, Form, InputNumber,
  DatePicker, Spin, Segmented, Checkbox, Dropdown, Switch,
} from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../../context/AuthContext.jsx';
import { FABRIC_CATEGORY, fmtQty, qtyLabel } from '../../utils/format.js';
import { EllipsisOutlined, RightCircleOutlined, DownloadOutlined } from '@ant-design/icons';
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
  const [showVarieties, setShowVarieties] = useState(false);
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
  const [branchNeeds, setBranchNeeds] = useState([]);
  const [branchNeedsLoading, setBranchNeedsLoading] = useState(false);
  const [storehousePendingRequests, setStorehousePendingRequests] = useState([]);
  const [storehousePendingLoading, setStorehousePendingLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [storehouseStockFilter, setStorehouseStockFilter] = useState('all');
  const [restockCart, setRestockCart] = useState({});
  const [varietyModalVisible, setVarietyModalVisible] = useState(false);
  const [varietyModalProduct, setVarietyModalProduct] = useState(null);
  const [varietyModalQtys, setVarietyModalQtys] = useState({});
  const [varietyCheckedIds, setVarietyCheckedIds] = useState(new Set());
  const [restockSearchText, setRestockSearchText] = useState('');
  const [replenishVisible, setReplenishVisible] = useState(false);
  const [replenishItems, setReplenishItems] = useState([]);
  const [replenishCart, setReplenishCart] = useState({});
  const [replenishSearchText, setReplenishSearchText] = useState('');
  const [replenishSubmitting, setReplenishSubmitting] = useState(false);
  const [repVarietyModalVisible, setRepVarietyModalVisible] = useState(false);
  const [repVarietyModalProduct, setRepVarietyModalProduct] = useState(null);
  const [repVarietyModalQtys, setRepVarietyModalQtys] = useState({});
  const [repVarietyCheckedIds, setRepVarietyCheckedIds] = useState(new Set());
  const [replenishRemark, setReplenishRemark] = useState('');
  const receiptCaptureRef = useRef(null);
  const replenishReceiptCaptureRef = useRef(null);

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
        fetch(`/api/inventory?usertype=${user.usertype}${locationParam}${userIdParam}&page=1&limit=500${searchParam}${sortParam}${statusParam}`),
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
          if (row.variety_id) {
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
              g.parent.quantity = g.varieties.reduce((s, v) => s + (v.quantity || 0), 0);
            }
            merged.push(g.parent);
          } else if (g.varieties.length > 0) {
            g.varieties[0].varietiesList = g.varieties;
            g.varieties[0].quantity = g.varieties.reduce((sum, v) => sum + (v.quantity || 0), 0);
            merged.push(g.varieties[0]);
          }
        }
        setInventory(merged);
        setTotalCount(merged.length);
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
      fetchStorehousePendingRequests();
    }
  }, [isStorehouse, selectedLocationId, storehouse]);

  useEffect(() => {
    setCurrentPage(1);
    setMovementsCache({});
    fetchData(1);
  }, [user, selectedLocationId, statusFilter, searchText]);

  const handleViewDetails = async (record) => {
    setSelectedRecord(record);
    if (movementsCache[record.product_id]) {
      setMovements(movementsCache[record.product_id]);
    } else {
      try {
        const varietyParam = record.variety_id ? `&variety_id=${record.variety_id}` : '';
        const res = await fetch(`/api/inventory/movements?usertype=${user.usertype}&product_id=${record.product_id}${varietyParam}`);
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
        const stockCheckUrl = `/api/inventory/product/${selectedRecord.product_id}?usertype=${user.usertype}&location_id=${values.from_location_id}&stock_check=1${selectedRecord.variety_id ? `&variety_id=${selectedRecord.variety_id}` : ''}`;
        const sourceRes = await fetch(stockCheckUrl);
        const sourceData = await sourceRes.json();
        if (sourceData.success) {
          let sourceInv = sourceData.data.find(i => i.location_id === values.from_location_id && (!selectedRecord.variety_id || i.variety_id === selectedRecord.variety_id));
          if (!sourceInv && selectedRecord.variety_id) {
            sourceInv = sourceData.data.find(i => i.location_id === values.from_location_id);
          }
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
            variety_id: selectedRecord.variety_id || null,
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
            variety_id: selectedRecord.variety_id || null,
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
          variety_id: selectedRecord.variety_id || null,
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
      const branchRes = await fetch(`/api/inventory?usertype=${user.usertype}&location_id=${selectedLocationId}&user_id=${user.user_id}&limit=1000`);
      const branchData = await branchRes.json();
      if (!branchData.success) {
        Modal.error({ title: 'Error', content: branchData.message || 'Failed to load items', centered: true });
        return;
      }
      const raw = branchData.data.data || [];
      const pids = [...new Set(raw.map((r) => r.product_id))];
      let storehouseData = [];
      if (storehouse && pids.length > 0) {
        const storeRes = await fetch(`/api/inventory?usertype=${user.usertype}&location_id=${storehouse.location_id}&user_id=${user.user_id}&limit=1000&product_ids=${pids.join(',')}`);
        const storeJson = await storeRes.json();
        storehouseData = storeJson.success ? (storeJson.data.data || []) : [];
      }
      const groups = {};
      for (const row of raw) {
        const key = `${row.product_id}-${row.location_id}`;
        if (!groups[key]) groups[key] = { parent: null, varieties: [] };
        if (row.variety_id) {
          groups[key].varieties.push(row);
        } else {
          groups[key].parent = row;
        }
      }
      const storeMap = {};
      const varietyStoreQty = {};
      for (const item of storehouseData) {
        const pid = item.product_id;
        const vid = item.variety_id;
        const vkey = `${pid}-${vid || ''}`;
        if (!storeMap[pid]) storeMap[pid] = { quantity: 0 };
        storeMap[pid].quantity += item.quantity || 0;
        varietyStoreQty[vkey] = (varietyStoreQty[vkey] || 0) + (item.quantity || 0);
      }
      const merged = [];
      for (const g of Object.values(groups)) {
        if (g.parent) {
          const st = storeMap[g.parent.product_id] || {};
          g.parent.storehouse_quantity = st.quantity || 0;
          g.parent.varietiesList = g.varieties;
          g.parent.varietiesList.forEach((v) => {
            v.variety_store_qty = varietyStoreQty[`${v.product_id}-${v.variety_id}`] || 0;
          });
          if (g.varieties.length > 0) {
            g.parent.quantity = g.varieties.reduce((s, v) => s + (v.quantity || 0), 0);
          }
          merged.push(g.parent);
        } else if (g.varieties.length > 0) {
          g.varieties[0].varietiesList = g.varieties;
          g.varieties[0].varietiesList.forEach((v) => {
            v.variety_store_qty = varietyStoreQty[`${v.product_id}-${v.variety_id}`] || 0;
          });
          const st = storeMap[g.varieties[0].product_id] || {};
          g.varieties[0].storehouse_quantity = st.quantity || 0;
          g.varieties[0].quantity = g.varieties.reduce((sum, v) => sum + (v.quantity || 0), 0);
          merged.push(g.varieties[0]);
        }
      }
      setLowStockItems(merged);
      setRestockCart({});
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to load items', centered: true });
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

  const handleAddToCart = (product, variety = null) => {
    const key = variety ? `${product.product_id}-${variety.variety_id}` : `${product.product_id}`;
    setRestockCart((prev) => {
      if (prev[key]) {
        return prev;
      }
      const isFab = product.category === FABRIC_CATEGORY;
      const qty = variety ? 0 : Math.max(0, (product.reorder_level || 0) - product.quantity) || 0;
      return {
        ...prev,
        [key]: {
          key,
          product_id: product.product_id,
          product_name: product.product_name,
          variety_id: variety?.variety_id || null,
          variety_label: variety ? `${variety.color || ''} ${variety.pattern || ''}`.trim() : null,
          quantity: qty,
          storehouse_qty: product.storehouse_quantity || 0,
          is_fabric: isFab,
          category: product.category,
        },
      };
    });
  };

  const handleRemoveFromCart = (key) => {
    setRestockCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleUpdateCartQty = (key, value) => {
    setRestockCart((prev) => {
      if (!prev[key]) return prev;
      return { ...prev, [key]: { ...prev[key], quantity: value } };
    });
  };

  const handleOpenVarietyModal = (product) => {
    const initial = {};
    (product.varietiesList || []).forEach((v) => {
      initial[v.variety_id] = 1;
    });
    setVarietyModalQtys(initial);
    setVarietyModalProduct(product);
    setVarietyCheckedIds(new Set());
    setVarietyModalVisible(true);
  };

  const handleAddVarietyToCart = () => {
    const product = varietyModalProduct;
    if (!product) return;
    for (const v of (product.varietiesList || [])) {
      if (!varietyCheckedIds.has(v.variety_id)) continue;
      const qty = varietyModalQtys[v.variety_id] || 0;
      if (qty <= 0) continue;
      const key = `${product.product_id}-${v.variety_id}`;
      setRestockCart((prev) => {
        if (prev[key]) {
          return { ...prev, [key]: { ...prev[key], quantity: (prev[key].quantity || 0) + qty } };
        }
        return {
          ...prev,
          [key]: {
            key,
            product_id: product.product_id,
            product_name: product.product_name,
            variety_id: v.variety_id,
            variety_label: `${v.color || ''} ${v.pattern || ''}`.trim(),
            quantity: qty,
            storehouse_qty: product.storehouse_quantity || 0,
            is_fabric: product.category === FABRIC_CATEGORY,
            category: product.category,
          },
        };
      });
    }
    setVarietyModalVisible(false);
    setVarietyModalProduct(null);
    setVarietyModalQtys({});
    setVarietyCheckedIds(new Set());
  };

  const handleConfirmRestock = async () => {
    const items = [];
    for (const entry of Object.values(restockCart)) {
      if (entry.quantity > 0) {
        items.push({ product_id: entry.product_id, quantity: entry.quantity, variety_id: entry.variety_id || undefined });
      }
    }
    if (items.length === 0) {
      Modal.warning({ title: 'Warning', content: 'No items in cart with quantity > 0', centered: true });
      return;
    }

    const unavailable = items.filter((item) => {
      const cartEntry = Object.values(restockCart).find((e) => e.product_id === item.product_id);
      return !cartEntry || (cartEntry.storehouse_qty || 0) < item.quantity;
    });
    if (unavailable.length > 0) {
      const names = unavailable.map((i) => {
        const e = Object.values(restockCart).find((e) => e.product_id === i.product_id);
        return e?.product_name || `Product #${i.product_id}`;
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
        setSelectRestockVisible(false);
        setRestockCart({});
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

  /* ── Replenish handlers ── */

  const handleOpenReplenish = async () => {
    if (selectedLocationId === "all") {
      Modal.warning({ title: 'Warning', content: 'Select a specific branch from the top bar to replenish', centered: true });
      return;
    }
    try {
      const res = await fetch(`/api/inventory?usertype=${user.usertype}&location_id=${selectedLocationId}&user_id=${user.user_id}&limit=1000`);
      const json = await res.json();
      if (!json.success) {
        Modal.error({ title: 'Error', content: json.message || 'Failed to load items', centered: true });
        return;
      }
      const raw = json.data.data || [];
      const groups = {};
      for (const row of raw) {
        const key = `${row.product_id}-${row.location_id}`;
        if (!groups[key]) groups[key] = { parent: null, varieties: [] };
        if (row.variety_id) {
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
            g.parent.quantity = g.varieties.reduce((s, v) => s + (v.quantity || 0), 0);
          }
          merged.push(g.parent);
        } else if (g.varieties.length > 0) {
          g.varieties[0].varietiesList = g.varieties;
          g.varieties[0].quantity = g.varieties.reduce((sum, v) => sum + (v.quantity || 0), 0);
          merged.push(g.varieties[0]);
        }
      }
      setReplenishItems(merged);
      setReplenishCart({});
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to load items', centered: true });
    }
    setReplenishVisible(true);
  };

  const handleAddToReplenishCart = (product, variety = null) => {
    const key = variety ? `${product.product_id}-${variety.variety_id}` : `${product.product_id}`;
    setReplenishCart((prev) => {
      if (prev[key]) return prev;
      const isFab = product.category === FABRIC_CATEGORY;
      const qty = 1;
      return {
        ...prev,
        [key]: {
          key,
          product_id: product.product_id,
          product_name: product.product_name,
          variety_id: variety?.variety_id || null,
          variety_label: variety ? `${variety.color || ''} ${variety.pattern || ''}`.trim() : null,
          quantity: qty,
          is_fabric: isFab,
          category: product.category,
        },
      };
    });
  };

  const handleRemoveFromReplenishCart = (key) => {
    setReplenishCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleUpdateReplenishCartQty = (key, value) => {
    setReplenishCart((prev) => {
      if (!prev[key]) return prev;
      return { ...prev, [key]: { ...prev[key], quantity: value } };
    });
  };

  const handleOpenRepVarietyModal = (product) => {
    const initial = {};
    (product.varietiesList || []).forEach((v) => {
      initial[v.variety_id] = 1;
    });
    setRepVarietyModalQtys(initial);
    setRepVarietyModalProduct(product);
    setRepVarietyCheckedIds(new Set());
    setRepVarietyModalVisible(true);
  };

  const handleAddRepVarietyToCart = () => {
    const product = repVarietyModalProduct;
    if (!product) return;
    for (const v of (product.varietiesList || [])) {
      if (!repVarietyCheckedIds.has(v.variety_id)) continue;
      const qty = repVarietyModalQtys[v.variety_id] || 0;
      if (qty <= 0) continue;
      const key = `${product.product_id}-${v.variety_id}`;
      setReplenishCart((prev) => {
        if (prev[key]) {
          return { ...prev, [key]: { ...prev[key], quantity: (prev[key].quantity || 0) + qty } };
        }
        const isFab = product.category === FABRIC_CATEGORY;
        return {
          ...prev,
          [key]: {
            key,
            product_id: product.product_id,
            product_name: product.product_name,
            variety_id: v.variety_id,
            variety_label: `${v.color || ''} ${v.pattern || ''}`.trim(),
            quantity: qty,
            is_fabric: isFab,
            category: product.category,
          },
        };
      });
    }
    setRepVarietyModalVisible(false);
    setRepVarietyModalProduct(null);
    setRepVarietyModalQtys({});
    setRepVarietyCheckedIds(new Set());
  };

  const handleConfirmReplenish = async () => {
    const items = [];
    for (const entry of Object.values(replenishCart)) {
      if (entry.quantity > 0) {
        items.push({ product_id: entry.product_id, quantity: entry.quantity, variety_id: entry.variety_id || undefined });
      }
    }
    if (items.length === 0) {
      Modal.warning({ title: 'Warning', content: 'No items with quantity > 0', centered: true });
      return;
    }
    setReplenishSubmitting(true);
    try {
      const res = await fetch('/api/inventory/replenish', {
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
        Modal.success({ title: 'Success', content: `Replenished ${json.data.count} product(s)`, centered: true });
        setReplenishVisible(false);
        setReplenishCart({});
        fetchData();
      } else {
        Modal.error({ title: 'Error', content: json.message, centered: true });
      }
    } catch {
      Modal.error({ title: 'Error', content: 'Failed to replenish inventory', centered: true });
    } finally {
      setReplenishSubmitting(false);
    }
  };

  /* ── end Replenish ── */

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

  const handlePrintReplenishSummary = async () => {
    if (!replenishReceiptCaptureRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(replenishReceiptCaptureRef.current, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
    });
    const link = document.createElement('a');
    link.download = 'replenish-receipt.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const { total_items: totalItems, low_stock_count: lowStockCount, out_of_stock_count: outOfStockCount, pending_request_count: pendingRequestCount } = stats;

  const showBranch = selectedLocationId === "all";
  const visibleData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageParents = inventory.slice(start, end);
    if (!showVarieties) return pageParents;
    const flat = [];
    for (const item of pageParents) {
      flat.push({ ...item, _rowType: 'parent' });
      if (item.varietiesList && item.varietiesList.length > 0) {
        for (const v of item.varietiesList) {
          flat.push({ ...v, _rowType: 'variety' });
        }
      }
    }
    return flat;
  }, [inventory, currentPage, pageSize, showVarieties]);
  const receiptItems = Object.values(restockCart).filter((e) => e.quantity > 0);
  const receiptTotalQty = receiptItems.reduce((sum, e) => sum + (e.quantity || 0), 0);
  const receiptRef = `RS-${Date.now().toString(36).toUpperCase()}`;
  const replenishReceiptItems = Object.values(replenishCart).filter((e) => e.quantity > 0);
  const replenishReceiptTotalQty = replenishReceiptItems.reduce((sum, e) => sum + (e.quantity || 0), 0);
  const replenishReceiptRef = `RP-${Date.now().toString(36).toUpperCase()}`;

  const columns = [
    {
      title: 'Product Name', dataIndex: 'product_name', key: 'product_name',
      sorter: (a, b) => 0,
      sortOrder: sortBy === 'product_name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (text, record) => {
        if (record._rowType === 'variety') {
          return (
            <div style={{ paddingLeft: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
              {record.color && (
                <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: record.color === 'White' ? '#ddd' : record.color, display: 'inline-block', border: '1px solid #d9d9d9', flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 500 }}>{record.pattern || 'Default'}</span>
              {record.color && <span style={{ color: '#888' }}>{record.color}</span>}
            </div>
          );
        }
        return text;
      },
    },
    ...(showBranch ? [{
      title: 'Branch', dataIndex: 'location_name', key: 'location_name',
      sorter: (a, b) => 0,
      sortOrder: sortBy === 'location_name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    }] : []),
    {
      title: 'Current Stock Quantity', dataIndex: 'quantity', key: 'quantity',
      sorter: (a, b) => 0,
      sortOrder: sortBy === 'quantity' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      onCell: (record) => {
        const n = Number(record.quantity);
        return {
          className: n === 0 ? 'qty-oos' : n <= 10 ? 'qty-low' : 'qty-normal',
        };
      },
      render: (qty, record) => {
        const val = fmtQty(qty, record.category === FABRIC_CATEGORY);
        return <span>{val}</span>;
      },
    },
    {
      title: 'Stock Status',
      dataIndex: 'quantity',
      key: 'stockStatus',
      sorter: (a, b) => 0,
      sortOrder: sortBy === 'stockStatus' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (qty, record) => {
        if (record._rowType === 'variety') return getStockStatus(qty).tag;
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
      sorter: (a, b) => 0,
      sortOrder: sortBy === 'reorder_level' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (val, record) => {
        if (record._rowType === 'variety') return null;
        return val ? Number(val).toLocaleString() : '-';
      },
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, record) => {
        if (record.varietiesList && record.varietiesList.length > 0 && record._rowType !== 'variety') return null;
        return (
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
        );
      },
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

  if (!isStorehouse && loading && inventory.length === 0) return <Card style={{ textAlign: 'center' }}><Spin size="large" /></Card>;

  const visibleColumns = selectedLocationId === 'all'
    ? columns
    : columns.filter(col => col.key !== 'location_name');

  const restockFooterItems = [
    <Button key="cancel" onClick={() => { setSelectRestockVisible(false); setRestockCart({}); }}>Cancel</Button>,
    <Button key="confirm" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} loading={restockSubmitting} onClick={handleConfirmRestock}>Confirm Restock</Button>,
  ];

  const replenishFooterItems = [
    <Button key="cancel" onClick={() => { setReplenishVisible(false); setReplenishCart({}); }}>Cancel</Button>,
    <Button key="confirm" type="primary" style={{ background: '#1677ff', borderColor: '#1677ff' }} loading={replenishSubmitting} onClick={handleConfirmReplenish}>Confirm Replenish</Button>,
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
            <Tag color="green">Auto Stock</Tag>
            <span><strong>{storehouse.name}</strong></span>
          </Space>
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={14}>
          <Space wrap>
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
              {isStorehouse && can('update') && (
                <Button type="primary" onClick={handleOpenReplenish} disabled={selectedLocationId === "all"}>
                  Replenish
                </Button>
              )}
              {!isStorehouse && can('update') && (
                <Button type="primary" onClick={handleOpenSelectRestock} disabled={selectedLocationId === "all"}>
                  Select Restock
                </Button>
              )}
            </>
          </Space>
        </Col>
      </Row>

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
            onChange={(val) => { setStatusFilter(val === 'all' ? '' : val); setCurrentPage(1); }}
          />
          <Switch checked={showVarieties} onChange={setShowVarieties} />
          <span style={{ fontSize: 13, color: '#888' }}>Show varieties</span>
        </Space>
        <Table
          dataSource={visibleData}
          columns={visibleColumns}
          rowKey={(record) => record._rowType === 'variety' ? `v-${record.inventory_id}` : record.inventory_id}
          loading={loading}
          scroll={{ x: 'max-content' }}
          rowClassName={(record) => {
            if (record._rowType === 'variety') {
              const q = Number(record.quantity);
              if (q === 0) return 'row-variety row-out-of-stock';
              if (q <= 10) return 'row-variety row-low-stock';
              return 'row-variety';
            }
            const q = Number(record.quantity);
            if (q === 0) return 'row-out-of-stock';
            if (q <= 10) return 'row-low-stock';
            return '';
          }}
          onChange={(pagination, filters, sorter) => {
            if (sorter.field) {
              const newSortBy = sorter.field;
              const newSortOrder = sorter.order === 'descend' ? 'desc' : 'asc';
              setSortBy(newSortBy);
              setSortOrder(newSortOrder);
              setCurrentPage(1);
              fetchData(1);
            }
          }}
          pagination={{
            current: currentPage,
            pageSize,
            total: totalCount,
            showSizeChanger: true,
            pageSizeOptions: [10, 25, 50, 100],
            onChange: (p) => setCurrentPage(p),
            onShowSizeChange: (_, size) => { setPageSize(size); setCurrentPage(1); },
          }}
        />
      </>

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
            Set the minimum stock threshold. Auto-restock will source from the storehouse.
          </Typography.Text>
          <Form.Item name="reorder_level" label="Reorder Level" rules={[{ required: true, message: 'Please enter reorder level' }]}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="Enter minimum stock level" />
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
        onCancel={() => { setSelectRestockVisible(false); setRestockCart({}); }}
        width={1100}
        centered
        styles={{ body: { padding: '16px 24px', maxHeight: '80vh', overflowY: 'auto' } }}
        footer={restockFooterItems}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={17}>
            <Input.Search
              placeholder="Search products..."
              value={restockSearchText}
              onChange={(e) => setRestockSearchText(e.target.value)}
              allowClear
              style={{ marginBottom: 16, width: 280 }}
            />
            {[
              { label: 'Out of Stock', key: 'out', filter: (p) => Number(p.quantity) === 0 },
              { label: 'Low Stock', key: 'low', filter: (p) => Number(p.quantity) > 0 && Number(p.quantity) < Number(p.reorder_level) },
              { label: 'In Stock', key: 'in', filter: (p) => Number(p.quantity) >= Number(p.reorder_level) || !p.reorder_level },
            ].map((section) => {
              const items = lowStockItems.filter((p) => {
                if (restockSearchText && !p.product_name.toLowerCase().includes(restockSearchText.toLowerCase())) return false;
                return section.filter(p);
              });
              if (items.length === 0) return null;
              return (
                <div key={section.key} style={{ marginBottom: 20 }}>
                  <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8, color: section.key === 'out' ? '#cf1322' : section.key === 'low' ? '#fa8c16' : '#52c41a' }}>
                    {section.label} ({items.length})
                  </Typography.Text>
                  <Row gutter={[12, 12]}>
                    {items.map((product) => {
                      const inCart = Object.values(restockCart).some((e) => e.product_id === product.product_id && !e.variety_id);
                      const inCartVarieties = Object.values(restockCart).filter((e) => e.product_id === product.product_id && e.variety_id);
                      return (
                        <Col xs={12} md={8} key={product.product_id}>
                          <Card
                            hoverable
                            size="small"
                            onClick={() => {
                              const hasVarieties = product.varietiesList && product.varietiesList.length > 0;
                              if (hasVarieties) {
                                handleOpenVarietyModal(product);
                              } else {
                                handleAddToCart(product);
                              }
                            }}
                            style={{
                              borderColor: inCart || inCartVarieties.length > 0 ? '#52c41a' : undefined,
                              borderWidth: inCart || inCartVarieties.length > 0 ? 2 : 1,
                              background: inCart || inCartVarieties.length > 0 ? '#f6ffed' : undefined,
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: 1.3 }}>{product.product_name}</div>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
                              Current: {fmtQty(product.quantity, product.category === FABRIC_CATEGORY)}
                            </div>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
                              Storehouse: {fmtQty(product.storehouse_quantity || 0, product.category === FABRIC_CATEGORY)}
                            </div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                              Reorder: {product.reorder_level ? Number(product.reorder_level).toLocaleString() : '-'}
                            </div>
                            <div style={{ marginTop: 4 }}>{getStockStatus(product.quantity).tag}</div>
                            {(inCartVarieties.length > 0) && (
                              <div style={{ fontSize: 11, color: '#52c41a', marginTop: 4, fontWeight: 600 }}>
                                {inCartVarieties.length} variety(ies) selected
                              </div>
                            )}
                            {inCart && (
                              <div style={{ fontSize: 11, color: '#52c41a', marginTop: 4, fontWeight: 600 }}>
                                In cart
                              </div>
                            )}
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              );
            })}
            {lowStockItems.length === 0 && (
              <Typography.Text type="secondary">No products loaded</Typography.Text>
            )}
          </Col>
          <Col xs={24} lg={7}>
            <div style={{ background: '#fafafa', borderRadius: 8, padding: 12, minHeight: 200, border: '1px solid #f0f0f0' }}>
              <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>Selected Items</Typography.Text>
              {Object.values(restockCart).length === 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Click a product card to add items</Typography.Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.values(restockCart).map((entry) => (
                    <div key={entry.key} style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', border: '1px solid #e8e8e8' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{entry.product_name}</div>
                        <Button type="text" size="small" danger onClick={() => handleRemoveFromCart(entry.key)} style={{ padding: 0, height: 20, width: 20, minWidth: 20, marginLeft: 4 }}>✕</Button>
                      </div>
                      {entry.variety_label && (
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{entry.variety_label}</div>
                      )}
                      <QtyInput
                        isFabric={entry.is_fabric}
                        value={entry.quantity}
                        min={0}
                        max={entry.storehouse_qty || 9999}
                        onChange={(val) => handleUpdateCartQty(entry.key, val || 0)}
                      />
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                        Avail: {fmtQty(entry.storehouse_qty, entry.is_fabric)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {Object.values(restockCart).length > 0 && (
                <>
                  <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e8e8e8' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Total: {Object.values(restockCart).filter((e) => e.quantity > 0).length} item(s)
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type="default"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={handlePrintSummary}
                      block
                    >
                      Download Receipt
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Col>
        </Row>
      </Modal>

      <Modal
        title={`Select Variety — ${varietyModalProduct?.product_name || ''}`}
        open={varietyModalVisible}
        onCancel={() => { setVarietyModalVisible(false); setVarietyModalProduct(null); setVarietyModalQtys({}); setVarietyCheckedIds(new Set()); }}
        footer={[
          <Button key="cancel" onClick={() => { setVarietyModalVisible(false); setVarietyModalProduct(null); setVarietyModalQtys({}); setVarietyCheckedIds(new Set()); }}>Cancel</Button>,
          <Button key="add" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={handleAddVarietyToCart}>Add to Cart</Button>,
        ]}
        width={480}
        centered
        destroyOnClose
      >
        {varietyModalProduct && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 12, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Checkbox
                checked={varietyCheckedIds.size > 0 && varietyCheckedIds.size === (varietyModalProduct.varietiesList || []).length}
                indeterminate={varietyCheckedIds.size > 0 && varietyCheckedIds.size < (varietyModalProduct.varietiesList || []).length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVarietyCheckedIds(new Set((varietyModalProduct.varietiesList || []).map((v) => v.variety_id)));
                  } else {
                    setVarietyCheckedIds(new Set());
                  }
                }}
              >
                Select All
              </Checkbox>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(varietyModalProduct.varietiesList || []).map((v) => {
                const checked = varietyCheckedIds.has(v.variety_id);
                return (
                  <div
                    key={v.variety_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      border: checked ? '2px solid #52c41a' : '1px solid #d9d9d9',
                      background: checked ? '#f6ffed' : '#fff',
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => {
                        setVarietyCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(v.variety_id)) next.delete(v.variety_id);
                          else next.add(v.variety_id);
                          return next;
                        });
                      }}
                    />
                    {v.color && (
                      <span style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: v.color, border: '1px solid #d9d9d9', flexShrink: 0, display: 'inline-block' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {v.pattern || 'Default'}
                        <Tag style={{ marginLeft: 6, fontSize: 10 }}>{fmtQty(v.quantity || 0, varietyModalProduct.category === FABRIC_CATEGORY)}</Tag>
                      </div>
                      {v.color && <div style={{ fontSize: 11, color: '#888' }}>{v.color}{v.variety_sku ? ` — ${v.variety_sku}` : ''}</div>}
                    </div>
                    {checked && (
                      <QtyInput
                        isFabric={varietyModalProduct.category === FABRIC_CATEGORY}
                        value={varietyModalQtys[v.variety_id] || 0}
                        min={0}
                        max={v.variety_store_qty ?? (varietyModalProduct.storehouse_quantity || 9999)}
                        onChange={(val) => setVarietyModalQtys((prev) => ({ ...prev, [v.variety_id]: val || 0 }))}
                      />
                    )}
                  </div>
                );
              })}
              {(varietyModalProduct.varietiesList || []).length === 0 && (
                <Typography.Text type="secondary">No varieties available</Typography.Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Replenish Modal ── */}
      <Modal
        title="Replenish Inventory"
        open={replenishVisible}
        onCancel={() => { setReplenishVisible(false); setReplenishCart({}); setReplenishRemark(''); }}
        width={1100}
        centered
        styles={{ body: { padding: '16px 24px', maxHeight: '80vh', overflowY: 'auto' } }}
        footer={replenishFooterItems}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={17}>
            <Input.Search
              placeholder="Search products..."
              value={replenishSearchText}
              onChange={(e) => setReplenishSearchText(e.target.value)}
              allowClear
              style={{ marginBottom: 16, width: 280 }}
            />
            {[
              { label: 'Out of Stock', key: 'out', filter: (p) => Number(p.quantity) === 0 },
              { label: 'Low Stock', key: 'low', filter: (p) => Number(p.quantity) > 0 && Number(p.quantity) < Number(p.reorder_level) },
              { label: 'In Stock', key: 'in', filter: (p) => Number(p.quantity) >= Number(p.reorder_level) || !p.reorder_level },
            ].map((section) => {
              const items = replenishItems.filter((p) => {
                if (replenishSearchText && !p.product_name.toLowerCase().includes(replenishSearchText.toLowerCase())) return false;
                return section.filter(p);
              });
              if (items.length === 0) return null;
              return (
                <div key={section.key} style={{ marginBottom: 20 }}>
                  <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8, color: section.key === 'out' ? '#cf1322' : section.key === 'low' ? '#fa8c16' : '#52c41a' }}>
                    {section.label} ({items.length})
                  </Typography.Text>
                  <Row gutter={[12, 12]}>
                    {items.map((product) => {
                      const inCart = Object.values(replenishCart).some((e) => e.product_id === product.product_id && !e.variety_id);
                      const inCartVarieties = Object.values(replenishCart).filter((e) => e.product_id === product.product_id && e.variety_id);
                      return (
                        <Col xs={12} md={8} key={product.product_id}>
                          <Card
                            hoverable
                            size="small"
                            onClick={() => {
                              const hasVarieties = product.varietiesList && product.varietiesList.length > 0;
                              if (hasVarieties) {
                                handleOpenRepVarietyModal(product);
                              } else {
                                handleAddToReplenishCart(product);
                              }
                            }}
                            style={{
                              borderColor: inCart || inCartVarieties.length > 0 ? '#1677ff' : undefined,
                              borderWidth: inCart || inCartVarieties.length > 0 ? 2 : 1,
                              background: inCart || inCartVarieties.length > 0 ? '#f0f5ff' : undefined,
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: 1.3 }}>{product.product_name}</div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                              Reorder: {product.reorder_level ? Number(product.reorder_level).toLocaleString() : '-'}
                            </div>
                            <div style={{ marginTop: 4 }}>{getStockStatus(product.quantity).tag}</div>
                            {(inCartVarieties.length > 0) && (
                              <div style={{ fontSize: 11, color: '#1677ff', marginTop: 4, fontWeight: 600 }}>
                                {inCartVarieties.length} variety(ies) selected
                              </div>
                            )}
                            {inCart && (
                              <div style={{ fontSize: 11, color: '#1677ff', marginTop: 4, fontWeight: 600 }}>
                                In cart
                              </div>
                            )}
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              );
            })}
            {replenishItems.length === 0 && (
              <Typography.Text type="secondary">No products loaded</Typography.Text>
            )}
          </Col>
          <Col xs={24} lg={7}>
            <div style={{ background: '#fafafa', borderRadius: 8, padding: 12, minHeight: 200, border: '1px solid #f0f0f0' }}>
              <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>Selected Items</Typography.Text>
              {Object.values(replenishCart).length === 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Click a product card to add items</Typography.Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.values(replenishCart).map((entry) => (
                    <div key={entry.key} style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', border: '1px solid #e8e8e8' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{entry.product_name}</div>
                        <Button type="text" size="small" danger onClick={() => handleRemoveFromReplenishCart(entry.key)} style={{ padding: 0, height: 20, width: 20, minWidth: 20, marginLeft: 4 }}>✕</Button>
                      </div>
                      {entry.variety_label && (
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{entry.variety_label}</div>
                      )}
                      <QtyInput
                        isFabric={entry.is_fabric}
                        value={entry.quantity}
                        min={0}
                        max={99999}
                        onChange={(val) => handleUpdateReplenishCartQty(entry.key, val || 0)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {Object.values(replenishCart).length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e8e8e8' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Total: {Object.values(replenishCart).filter((e) => e.quantity > 0).length} item(s)
                  </div>
                  <Input.TextArea
                    placeholder="Add a remark..."
                    value={replenishRemark}
                    onChange={(e) => setReplenishRemark(e.target.value)}
                    rows={2}
                    style={{ marginTop: 8, fontSize: 12 }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type="default"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={handlePrintReplenishSummary}
                      block
                    >
                      Download Receipt
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Modal>

      {/* ── Replenish Variety Modal ── */}
      <Modal
        title={`Select Variety — ${repVarietyModalProduct?.product_name || ''}`}
        open={repVarietyModalVisible}
        onCancel={() => { setRepVarietyModalVisible(false); setRepVarietyModalProduct(null); setRepVarietyModalQtys({}); setRepVarietyCheckedIds(new Set()); }}
        footer={[
          <Button key="cancel" onClick={() => { setRepVarietyModalVisible(false); setRepVarietyModalProduct(null); setRepVarietyModalQtys({}); setRepVarietyCheckedIds(new Set()); }}>Cancel</Button>,
          <Button key="add" type="primary" style={{ background: '#1677ff', borderColor: '#1677ff' }} onClick={handleAddRepVarietyToCart}>Add to Cart</Button>,
        ]}
        width={480}
        centered
        destroyOnClose
      >
        {repVarietyModalProduct && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 12, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Checkbox
                checked={repVarietyCheckedIds.size > 0 && repVarietyCheckedIds.size === (repVarietyModalProduct.varietiesList || []).length}
                indeterminate={repVarietyCheckedIds.size > 0 && repVarietyCheckedIds.size < (repVarietyModalProduct.varietiesList || []).length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setRepVarietyCheckedIds(new Set((repVarietyModalProduct.varietiesList || []).map((v) => v.variety_id)));
                  } else {
                    setRepVarietyCheckedIds(new Set());
                  }
                }}
              >
                Select All
              </Checkbox>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(repVarietyModalProduct.varietiesList || []).map((v) => {
                const checked = repVarietyCheckedIds.has(v.variety_id);
                return (
                  <div
                    key={v.variety_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      border: checked ? '2px solid #1677ff' : '1px solid #d9d9d9',
                      background: checked ? '#f0f5ff' : '#fff',
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => {
                        setRepVarietyCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(v.variety_id)) next.delete(v.variety_id);
                          else next.add(v.variety_id);
                          return next;
                        });
                      }}
                    />
                    {v.color && (
                      <span style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: v.color, border: '1px solid #d9d9d9', flexShrink: 0, display: 'inline-block' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {v.pattern || 'Default'}
                        <Tag style={{ marginLeft: 6, fontSize: 10 }}>{fmtQty(v.quantity || 0, repVarietyModalProduct.category === FABRIC_CATEGORY)}</Tag>
                      </div>
                      {v.color && <div style={{ fontSize: 11, color: '#888' }}>{v.color}{v.variety_sku ? ` — ${v.variety_sku}` : ''}</div>}
                    </div>
                    {checked && (
                      <QtyInput
                        isFabric={repVarietyModalProduct.category === FABRIC_CATEGORY}
                        value={repVarietyModalQtys[v.variety_id] || 0}
                        min={0}
                        max={99999}
                        onChange={(val) => setRepVarietyModalQtys((prev) => ({ ...prev, [v.variety_id]: val || 0 }))}
                      />
                    )}
                  </div>
                );
              })}
              {(repVarietyModalProduct.varietiesList || []).length === 0 && (
                <Typography.Text type="secondary">No varieties available</Typography.Text>
              )}
            </div>
          </div>
        )}
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
              <div key={item.key} className="receipt-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px dotted #ddd' }}>
                <span style={{ flex: 1, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.product_name}{item.variety_label ? ` (${item.variety_label})` : ''}
                </span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQty(item.quantity, item.is_fabric)}</span>
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
              <span>{qtyLabel(receiptTotalQty)}</span>
            </div>
          </div>
          <div className="receipt-footer" style={{ textAlign: 'center', marginTop: 20, paddingTop: 12, borderTop: '2px dashed #888', fontSize: 13, color: '#555' }}>
            Thank you!
          </div>
        </div>
      </div>

      <div id="replenish-receipt-print" ref={replenishReceiptCaptureRef} style={{ position: 'absolute', left: '-9999px', top: 0, width: 550, background: '#fff', zIndex: -1, padding: 32 }}>
        <div className="receipt-inner" style={{ width: '100%', padding: '24px 24px', fontFamily: "'Courier New', monospace", fontSize: 14, color: '#222', background: '#fff', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <img src={logoImage} alt="Logo" style={{ height: 60, width: 'auto', display: 'block', margin: '0 auto 6px' }} />
            <div className="receipt-header" style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{receiptConfig.companyName}</div>
          </div>
          <div className="receipt-section" style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, padding: '6px 0', borderTop: '2px dashed #888', borderBottom: '2px dashed #888', marginBottom: 12 }}>
            REPLENISH RECEIPT
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 13 }}>
            <tbody>
              {[['Date:', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
                ['Ref No:', replenishReceiptRef],
                ['Branch:', user?.location_name || `Branch #${user?.location_id}`],
                ['Prepared by:', user?.username || '-']].map(([label, value], i) => (
                <tr key={i}>
                  <td className="receipt-label" style={{ padding: '2px 4px', color: '#666' }}>{label}</td>
                  <td className="receipt-label" style={{ padding: '2px 4px', textAlign: 'right' }}>{value}</td>
                </tr>
              ))}
              {replenishRemark && (
                <tr>
                  <td className="receipt-label" style={{ padding: '2px 4px', color: '#666', verticalAlign: 'top' }}>Remark:</td>
                  <td className="receipt-label" style={{ padding: '2px 4px', textAlign: 'right', color: '#333' }}>{replenishRemark}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ borderTop: '1px dashed #aaa', borderBottom: '1px dashed #aaa', padding: '6px 0', marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 13 }}>
            <span>Item</span>
            <span>Qty</span>
          </div>
          {replenishReceiptItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#999' }}>No items selected</div>
          ) : (
            replenishReceiptItems.map((item) => (
              <div key={item.key} className="receipt-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px dotted #ddd' }}>
                <span style={{ flex: 1, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.product_name}{item.variety_label ? ` (${item.variety_label})` : ''}
                </span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQty(item.quantity, item.is_fabric)}</span>
              </div>
            ))
          )}
          <div className="receipt-totals" style={{ borderTop: '2px dashed #888', marginTop: 8, paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>Total Items:</span>
              <span>{replenishReceiptItems.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
              <span>Total Quantity:</span>
              <span>{qtyLabel(replenishReceiptTotalQty)}</span>
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
