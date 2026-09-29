const express = require('express');
const { get, run } = require('./db');
const { Cashfree } = require('cashfree-pg');
const { authMiddleware, optionalAuth } = require('./middleware/auth');

const router = express.Router();

const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_ENV = process.env.NODE_ENV === 'production' ? 'PROD' : 'TEST';
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:5500';

Cashfree.XClientId = CASHFREE_APP_ID;
Cashfree.XClientSecret = CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = CASHFREE_ENV;

router.post('/create-order', optionalAuth, async (req, res) => {
  try {
    const { orderId, amount, customer } = req.body;
    
    if (!orderId || !amount || !customer) {
      return res.status(400).json({ error: 'orderId, amount, and customer are required' });
    }
    
    const order = get('SELECT * FROM orders WHERE order_id = ?', [orderId]);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order already paid' });
    }
    
    const customerId = customer.email || 'guest_' + Date.now();
    
    const orderPayload = {
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: customerId,
        customer_email: customer.email || '',
        customer_phone: customer.phone || '',
        customer_name: customer.name || 'Guest'
      },
      order_meta: {
        return_url: `${WEBSITE_URL}/payment-status.html?order_id={order_id}`,
        notify_url: `${WEBSITE_URL}/api/webhook/cashfree`,
        payment_methods: 'cc,dc,nb,upi,wallet,app'
      }
    };
    
    const response = await Cashfree.PGOrder.createOrder(orderPayload);
    
    if (response && response.data && response.data.payment_session_id) {
      run(
        'UPDATE orders SET cashfree_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
        [response.data.cf_order_id, orderId]
      );
      
      res.json({
        paymentSessionId: response.data.payment_session_id,
        orderId: orderId,
        cfOrderId: response.data.cf_order_id
      });
    } else {
      console.error('Cashfree order creation failed:', response);
      res.status(500).json({ error: 'Failed to create payment order', details: response });
    }
  } catch (err) {
    console.error('Create payment order error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

router.get('/order/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = get('SELECT * FROM orders WHERE order_id = ? AND user_id = ?', [req.params.orderId, req.user.id]);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (!order.cashfree_order_id) {
      return res.status(400).json({ error: 'No payment order found' });
    }
    
    const response = await Cashfree.PGOrder.fetchOrder(order.cashfree_order_id);
    
    if (response && response.data) {
      res.json({ order: response.data });
    } else {
      res.status(500).json({ error: 'Failed to fetch order from Cashfree' });
    }
  } catch (err) {
    console.error('Fetch payment order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = get('SELECT * FROM orders WHERE order_id = ? AND user_id = ?', [req.params.orderId, req.user.id]);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (!order.cashfree_order_id || !order.cashfree_payment_id) {
      return res.status(400).json({ error: 'Payment not initiated' });
    }
    
    const response = await Cashfree.PGOrder.fetchOrder(order.cashfree_order_id);
    
    if (response && response.data) {
      const cashfreeOrder = response.data;
      
      if (cashfreeOrder.order_status === 'PAID') {
        run(
          `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed', 
           cashfree_signature = ?, payment_details = ?, confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE order_id = ?`,
          [cashfreeOrder.signature, JSON.stringify(cashfreeOrder), req.params.orderId]
        );
        
        run(
          `INSERT INTO order_status_history (order_id, status, note, created_by)
           VALUES (?, ?, ?, ?)`,
          [order.id, 'confirmed', 'Payment verified and order confirmed', req.user.id]
        );
        
        return res.json({ success: true, message: 'Payment verified', order: cashfreeOrder });
      } else {
        return res.json({ success: false, message: 'Payment not completed', order: cashfreeOrder });
      }
    } else {
      res.status(500).json({ error: 'Failed to verify payment' });
    }
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/methods', (req, res) => {
  res.json({
    paymentMethods: [
      { id: 'online', name: 'Pay Online', description: 'Cards, UPI, Net Banking, Wallets', enabled: true },
      { id: 'cod', name: 'Cash on Delivery', description: 'Pay when you receive your order', enabled: true }
    ]
  });
});

module.exports = router;