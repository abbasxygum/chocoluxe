const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run, transaction } = require('./db');
const { authMiddleware, optionalAuth } = require('./middleware/auth');

const router = express.Router();

function generateOrderId() {
  return 'CHX' + Date.now() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

router.post('/', optionalAuth, (req, res) => {
  try {
    const {
      items,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerCity,
      customerPincode,
      specialInstructions,
      paymentMethod
    } = req.body;
    
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    if (!customerName || !customerEmail || !customerPhone || !customerAddress || !customerCity || !customerPincode) {
      return res.status(400).json({ error: 'All customer details are required' });
    }
    
    if (!['online', 'cod'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = subtotal >= 2000 ? 0 : 99;
    const tax = Math.round(subtotal * 0.05);
    const totalAmount = subtotal + shippingCost + tax;
    
    const orderId = generateOrderId();
    const userId = req.user?.id || null;
    
    const orderResult = run(
      `INSERT INTO orders (
        order_id, user_id, customer_name, customer_email, customer_phone,
        customer_address, customer_city, customer_pincode, special_instructions,
        items, subtotal, shipping_cost, tax, total_amount, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        userId,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        customerCity,
        customerPincode,
        specialInstructions || '',
        JSON.stringify(items),
        subtotal,
        shippingCost,
        tax,
        totalAmount,
        paymentMethod
      ]
    );
    
    const order = get('SELECT * FROM orders WHERE id = ?', [orderResult.lastID]);
    
    run(
      `INSERT INTO order_status_history (order_id, status, note, created_by)
       VALUES (?, ?, ?, ?)`,
      [orderResult.lastID, 'pending', 'Order placed', userId]
    );
    
    res.status(201).json({
      message: 'Order created successfully',
      order: {
        ...order,
        items: JSON.parse(order.items)
      }
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.get('/', authMiddleware, (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const offset = (page - 1) * limit;
  
  let sql = 'SELECT * FROM orders WHERE user_id = ?';
  const params = [req.user.id];
  
  if (status) {
    sql += ' AND order_status = ?';
    params.push(status);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  const orders = all(sql, params);
  
  const countSql = 'SELECT COUNT(*) as total FROM orders WHERE user_id = ?' + (status ? ' AND order_status = ?' : '');
  const countParams = [req.user.id];
  if (status) countParams.push(status);
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

router.get('/:orderId', authMiddleware, (req, res) => {
  const order = get('SELECT * FROM orders WHERE order_id = ? AND user_id = ?', [req.params.orderId, req.user.id]);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  const history = all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at', [order.id]);
  
  res.json({
    order: {
      ...order,
      items: JSON.parse(order.items)
    },
    history
  });
});

router.get('/guest/:orderId', (req, res) => {
  const order = get('SELECT * FROM orders WHERE order_id = ? AND user_id IS NULL', [req.params.orderId]);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  res.json({
    order: {
      ...order,
      items: JSON.parse(order.items)
    }
  });
});

module.exports = router;