const express = require('express');
const crypto = require('crypto');
const { get, run } = require('../db');
const { Cashfree } = require('cashfree-pg');

const router = express.Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your_webhook_secret_here';

function verifySignature(payload, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

router.post('/cashfree', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const payload = req.body.toString();
    
    run(
      `INSERT INTO cashfree_webhooks (event_type, order_id, payment_id, payload, signature, processed)
       VALUES (?, ?, ?, ?, ?, 0)`,
      ['unknown', null, null, payload, signature || '']
    );
    
    if (signature && WEBHOOK_SECRET !== 'your_webhook_secret_here') {
      if (!verifySignature(payload, signature)) {
        console.warn('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }
    
    const event = JSON.parse(payload);
    const webhookId = get('SELECT last_insert_rowid() as id').id;
    
    console.log('Cashfree webhook received:', event.type, event.data?.order?.order_id);
    
    switch (event.type) {
      case 'ORDER_Paid':
      case 'PAYMENT_SUCCESS':
        await handlePaymentSuccess(event.data, webhookId);
        break;
      case 'ORDER_FAILED':
      case 'PAYMENT_FAILED':
        await handlePaymentFailed(event.data, webhookId);
        break;
      case 'ORDER_CANCELLED':
        await handleOrderCancelled(event.data, webhookId);
        break;
      case 'ORDER_REFUNDED':
        await handleRefund(event.data, webhookId);
        break;
      default:
        console.log('Unhandled webhook event type:', event.type);
    }
    
    run('UPDATE cashfree_webhooks SET processed = 1 WHERE id = ?', [webhookId]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handlePaymentSuccess(data, webhookId) {
  const orderId = data.order?.order_id || data.order_id;
  const paymentId = data.payment?.payment_id || data.payment_id;
  const signature = data.signature;
  
  if (!orderId) return;
  
  const order = get('SELECT * FROM orders WHERE order_id = ?', [orderId]);
  if (!order) {
    console.warn('Order not found for payment success:', orderId);
    return;
  }
  
  run(
    `UPDATE orders SET 
      payment_status = 'paid', 
      order_status = 'confirmed',
      cashfree_payment_id = ?,
      cashfree_signature = ?,
      payment_details = ?,
      confirmed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE order_id = ?`,
    [paymentId, signature, JSON.stringify(data), orderId]
  );
  
  run(
    `INSERT INTO order_status_history (order_id, status, note, created_by)
     VALUES (?, 'confirmed', ?, NULL)`,
    [order.id, `Payment successful via Cashfree (${paymentId})`]
  );
  
  console.log('Payment success processed for order:', orderId);
}

async function handlePaymentFailed(data, webhookId) {
  const orderId = data.order?.order_id || data.order_id;
  const paymentId = data.payment?.payment_id || data.payment_id;
  
  if (!orderId) return;
  
  const order = get('SELECT * FROM orders WHERE order_id = ?', [orderId]);
  if (!order) return;
  
  run(
    `UPDATE orders SET 
      payment_status = 'failed',
      cashfree_payment_id = ?,
      payment_details = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE order_id = ?`,
    [paymentId, JSON.stringify(data), orderId]
  );
  
  run(
    `INSERT INTO order_status_history (order_id, status, note, created_by)
     VALUES (?, 'pending', ?, NULL)`,
    [order.id, `Payment failed via Cashfree (${paymentId})`]
  );
  
  console.log('Payment failure processed for order:', orderId);
}

async function handleOrderCancelled(data, webhookId) {
  const orderId = data.order?.order_id || data.order_id;
  
  if (!orderId) return;
  
  const order = get('SELECT * FROM orders WHERE order_id = ?', [orderId]);
  if (!order) return;
  
  run(
    `UPDATE orders SET order_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
    [orderId]
  );
  
  run(
    `INSERT INTO order_status_history (order_id, status, note, created_by)
     VALUES (?, 'cancelled', ?, NULL)`,
    [order.id, 'Order cancelled via Cashfree']
  );
  
  console.log('Order cancellation processed for order:', orderId);
}

async function handleRefund(data, webhookId) {
  const orderId = data.order?.order_id || data.order_id;
  const refundId = data.refund?.refund_id;
  
  if (!orderId) return;
  
  const order = get('SELECT * FROM orders WHERE order_id = ?', [orderId]);
  if (!order) return;
  
  run(
    `UPDATE orders SET 
      payment_status = 'refunded',
      payment_details = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE order_id = ?`,
    [JSON.stringify(data), orderId]
  );
  
  run(
    `INSERT INTO order_status_history (order_id, status, note, created_by)
     VALUES (?, 'refunded', ?, NULL)`,
    [order.id, `Refund processed: ${refundId}`]
  );
  
  console.log('Refund processed for order:', orderId);
}

router.get('/test', (req, res) => {
  res.json({ 
    message: 'Webhook endpoint is working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;