const express = require('express');
const { get, all, run } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', (req, res) => {
  const totalOrders = get('SELECT COUNT(*) as count FROM orders');
  const pendingOrders = get("SELECT COUNT(*) as count FROM orders WHERE order_status = 'pending'");
  const confirmedOrders = get("SELECT COUNT(*) as count FROM orders WHERE order_status = 'confirmed'");
  const processingOrders = get("SELECT COUNT(*) as count FROM orders WHERE order_status = 'processing'");
  const shippedOrders = get("SELECT COUNT(*) as count FROM orders WHERE order_status = 'shipped'");
  const deliveredOrders = get("SELECT COUNT(*) as count FROM orders WHERE order_status = 'delivered'");
  const cancelledOrders = get("SELECT COUNT(*) as count FROM orders WHERE order_status IN ('cancelled', 'rejected')");
  const totalRevenue = get("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid'");
  const totalUsers = get("SELECT COUNT(*) as count FROM users WHERE role = 'customer'");
  const totalProducts = get('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
  
  const recentOrders = all(
    `SELECT o.*, u.name as user_name 
     FROM orders o LEFT JOIN users u ON o.user_id = u.id 
     ORDER BY o.created_at DESC LIMIT 10`
  );
  
  const pendingPayments = all(
    `SELECT * FROM orders 
     WHERE payment_status = 'pending' AND payment_method = 'online'
     ORDER BY created_at DESC LIMIT 10`
  );
  
  res.json({
    stats: {
      totalOrders: totalOrders.count,
      pendingOrders: pendingOrders.count,
      confirmedOrders: confirmedOrders.count,
      processingOrders: processingOrders.count,
      shippedOrders: shippedOrders.count,
      deliveredOrders: deliveredOrders.count,
      cancelledOrders: cancelledOrders.count,
      totalRevenue: totalRevenue.total,
      totalUsers: totalUsers.count,
      totalProducts: totalProducts.count
    },
    recentOrders: recentOrders.map(o => ({ ...o, items: JSON.parse(o.items) })),
    pendingPayments
  });
});

router.get('/messages', (req, res) => {
  const orders = all(
    `SELECT order_id, customer_name, customer_email, customer_phone,
            special_instructions, items, created_at
     FROM orders
     WHERE special_instructions != '' OR items LIKE '%"message"%'
     ORDER BY created_at DESC
     LIMIT 500`
  );

  const messages = [];
  for (const o of orders) {
    let parsedItems = [];
    try { parsedItems = JSON.parse(o.items || '[]'); } catch (e) { /* skip */ }

    for (const item of parsedItems) {
      if (item.message && String(item.message).trim()) {
        messages.push({
          type: 'item',
          orderId: o.order_id,
          customerName: o.customer_name,
          customerEmail: o.customer_email,
          customerPhone: o.customer_phone,
          product: item.name,
          quantity: item.quantity,
          message: String(item.message).trim(),
          createdAt: o.created_at
        });
      }
    }

    if (o.special_instructions && String(o.special_instructions).trim()) {
      messages.push({
        type: 'note',
        orderId: o.order_id,
        customerName: o.customer_name,
        customerEmail: o.customer_email,
        customerPhone: o.customer_phone,
        product: null,
        quantity: null,
        message: String(o.special_instructions).trim(),
        createdAt: o.created_at
      });
    }
  }

  res.json({ messages });
});

router.get('/orders', (req, res) => {
  const { page = 1, limit = 20, status, paymentStatus, search } = req.query;
  const offset = (page - 1) * limit;
  
  let sql = `SELECT o.*, u.name as user_name, u.email as user_email 
             FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE 1=1`;
  const params = [];
  
  if (status) {
    sql += ' AND o.order_status = ?';
    params.push(status);
  }
  
  if (paymentStatus) {
    sql += ' AND o.payment_status = ?';
    params.push(paymentStatus);
  }
  
  if (search) {
    sql += ' AND (o.order_id LIKE ? OR o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.customer_phone LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }
  
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  const orders = all(sql, params);
  
  let countSql = `SELECT COUNT(*) as total FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE 1=1`;
  const countParams = [];
  
  if (status) {
    countSql += ' AND o.order_status = ?';
    countParams.push(status);
  }
  if (paymentStatus) {
    countSql += ' AND o.payment_status = ?';
    countParams.push(paymentStatus);
  }
  if (search) {
    countSql += ' AND (o.order_id LIKE ? OR o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.customer_phone LIKE ?)';
    const searchTerm = `%${search}%`;
    countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }
  
  const { total } = get(countSql, countParams);
  
  res.json({
    orders: orders.map(o => ({ ...o, items: JSON.parse(o.items) })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

router.get('/orders/:orderId', (req, res) => {
  const order = get(
    `SELECT o.*, u.name as user_name, u.email as user_email 
     FROM orders o LEFT JOIN users u ON o.user_id = u.id 
     WHERE o.order_id = ?`,
    [req.params.orderId]
  );
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  const history = all(
    `SELECT osh.*, u.name as created_by_name 
     FROM order_status_history osh LEFT JOIN users u ON osh.created_by = u.id 
     WHERE osh.order_id = ? ORDER BY osh.created_at`,
    [order.id]
  );
  
  res.json({
    order: { ...order, items: JSON.parse(order.items) },
    history
  });
});

router.patch('/orders/:orderId/status', (req, res) => {
  const { status, note } = req.body;
  
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  const order = get('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  const updateFields = ['order_status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const updateParams = [status];
  
  if (status === 'confirmed') updateFields.push('confirmed_at = CURRENT_TIMESTAMP');
  if (status === 'shipped') updateFields.push('shipped_at = CURRENT_TIMESTAMP');
  if (status === 'delivered') updateFields.push('delivered_at = CURRENT_TIMESTAMP');
  
  run(`UPDATE orders SET ${updateFields.join(', ')} WHERE order_id = ?`, [...updateParams, req.params.orderId]);
  
  run(
    `INSERT INTO order_status_history (order_id, status, note, created_by)
     VALUES (?, ?, ?, ?)`,
    [order.id, status, note || `Status changed to ${status}`, req.user.id]
  );
  
  const updatedOrder = get('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId]);
  
  res.json({
    message: 'Order status updated',
    order: { ...updatedOrder, items: JSON.parse(updatedOrder.items) }
  });
});

router.patch('/orders/:orderId/accept', (req, res) => {
  const order = get('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  if (order.order_status !== 'pending') {
    return res.status(400).json({ error: 'Order cannot be accepted in current status' });
  }
  
  if (order.payment_method === 'online' && order.payment_status !== 'paid') {
    return res.status(400).json({ error: 'Payment not completed for online order' });
  }
  
  run(
    `UPDATE orders SET order_status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
    [req.params.orderId]
  );
  
  run(
    `INSERT INTO order_status_history (order_id, status, note, created_by)
     VALUES (?, 'confirmed', 'Order accepted by admin', ?)`,
    [order.id, req.user.id]
  );
  
  const updatedOrder = get('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId]);
  
  res.json({
    message: 'Order accepted',
    order: { ...updatedOrder, items: JSON.parse(updatedOrder.items) }
  });
});

router.patch('/orders/:orderId/reject', (req, res) => {
  const { reason } = req.body;
  
  const order = get('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  if (!['pending', 'confirmed'].includes(order.order_status)) {
    return res.status(400).json({ error: 'Order cannot be rejected in current status' });
  }
  
  run(
    `UPDATE orders SET order_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
    [req.params.orderId]
  );
  
  run(
    `INSERT INTO order_status_history (order_id, status, note, created_by)
     VALUES (?, 'rejected', ?, ?)`,
    [order.id, reason || 'Order rejected by admin', req.user.id]
  );
  
  const updatedOrder = get('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId]);
  
  res.json({
    message: 'Order rejected',
    order: { ...updatedOrder, items: JSON.parse(updatedOrder.items) }
  });
});

router.get('/users', (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;
  
  let sql = "SELECT id, email, name, role, phone, address, city, pincode, created_at FROM users WHERE role = 'customer'";
  const params = [];
  
  if (search) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  const users = all(sql, params);
  
  let countSql = "SELECT COUNT(*) as total FROM users WHERE role = 'customer'";
  const countParams = [];
  if (search) {
    countSql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
    const searchTerm = `%${search}%`;
    countParams.push(searchTerm, searchTerm, searchTerm);
  }
  
  const { total } = get(countSql, countParams);
  
  res.json({
    users,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
  });
});

router.get('/analytics', (req, res) => {
  const { days = 30 } = req.query;
  
  const dailyOrders = all(
    `SELECT date(created_at) as date, COUNT(*) as orders, SUM(total_amount) as revenue
     FROM orders WHERE created_at >= date('now', ?) GROUP BY date(created_at) ORDER BY date`,
    [`-${days} days`]
  );
  
  const statusDistribution = all(
    `SELECT order_status as status, COUNT(*) as count FROM orders GROUP BY order_status`
  );
  
  const paymentDistribution = all(
    `SELECT payment_method as method, payment_status as status, COUNT(*) as count 
     FROM orders GROUP BY payment_method, payment_status`
  );
  
  const topProducts = all(
    `SELECT 
       json_each.value->>'name' as name,
       SUM(json_each.value->>'quantity') as quantity,
       SUM((json_each.value->>'quantity') * (json_each.value->>'price')) as revenue
     FROM orders, json_each(orders.items)
     WHERE orders.created_at >= date('now', ?)
     GROUP BY name
     ORDER BY revenue DESC LIMIT 10`,
    [`-${days} days`]
  );
  
  res.json({
    dailyOrders,
    statusDistribution,
    paymentDistribution,
    topProducts
  });
});

module.exports = router;