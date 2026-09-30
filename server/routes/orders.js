const express = require('express');
const { get, all, run } = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 50;
const MAX_NOTE_LENGTH = 500;
const MAX_QUANTITY = 20;

function generateOrderId() {
  return 'CHX' + Date.now() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

function normalizeItem(item) {
  const name = String(item.name || '').trim();
  const quantity = Math.round(Number(item.quantity));
  const size = String(item.size || '').trim();
  const message = String(item.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);

  if (!name) return { error: 'Item name is required' };
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { error: `Invalid quantity for ${name}` };
  }

  return { value: { name, quantity, size, message } };
}

// Prices live in the products table, so the total is always worked out from the
// database rather than trusting whatever the browser sent.
function resolvePrice(name, size) {
  const product = get(
    'SELECT id, name, sizes, is_active FROM products WHERE name = ? OR id = ? LIMIT 1',
    [name, Number(name)]
  );

  if (!product) return { error: `"${name}" is no longer available` };
  if (!product.is_active) return { error: `"${product.name}" is no longer available` };

  let sizes;
  try {
    sizes = JSON.parse(product.sizes);
  } catch {
    return { error: `"${product.name}" has invalid size data` };
  }

  const key = size in sizes ? size : Object.keys(sizes).find((k) => k.toLowerCase() === size.toLowerCase());
  if (!key) return { error: `Choose a size for ${product.name}` };

  const price = Math.round(Number(sizes[key]));
  if (!Number.isFinite(price) || price <= 0) {
    return { error: `"${product.name}" (${key}) has no valid price` };
  }

  return { value: { id: product.id, name: product.name, price, size: key } };
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
      paymentMethod
    } = req.body;
    
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    if (items.length > 50) {
      return res.status(400).json({ error: 'Too many items in cart' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerName || !customerEmail || !customerPhone || !customerAddress || !customerCity || !customerPincode) {
      return res.status(400).json({ error: 'All customer details are required' });
    }

    if (!emailRegex.test(String(customerEmail))) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!/^[0-9]{6}$/.test(String(customerPincode))) {
      return res.status(400).json({ error: 'Pincode must be 6 digits' });
    }

    if (!['online', 'cod'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    const normalizedItems = [];
    for (const item of items) {
      const { value: draft, error: itemError } = normalizeItem(item);
      if (itemError) return res.status(400).json({ error: itemError });

      const { value: priced, error: priceError } = resolvePrice(draft.name, draft.size);
      if (priceError) return res.status(400).json({ error: priceError });

      normalizedItems.push({ ...draft, ...priced });
    }

    const specialInstructions = String(req.body.specialInstructions || '').trim().slice(0, MAX_NOTE_LENGTH);

    const subtotal = normalizedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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
        specialInstructions,
        JSON.stringify(normalizedItems),
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