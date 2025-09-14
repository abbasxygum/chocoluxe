require('dotenv').config(); // Loads environment variables from .env file
const express = require('express');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');
const cors = require('cors'); // To allow requests from your frontend

const app = express();
const port = process.env.PORT || 3000;
const ordersFile = path.join(__dirname, 'orders.json');

// --- Using environment variables for security ---
const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const WEBHOOK_SECRET_KEY = 'YOUR_WEBHOOK_SECRET_KEY'; // Replace or move to .env

// Initialize Cashfree SDK
const cashfree = new Cashfree(
  CFEnvironment.SANDBOX, // Use CFEnvironment.PRODUCTION for live payments
  CASHFREE_CLIENT_ID,
  CASHFREE_SECRET_KEY
);

app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());

// Helper function to manage orders data
async function readOrders() {
    try {
        const data = await fs.readFile(ordersFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return {}; // File not found, start fresh
        throw error;
    }
}

async function writeOrders(data) {
    await fs.writeFile(ordersFile, JSON.stringify(data, null, 2), 'utf8');
}

// Endpoint to create a Cashfree payment order
app.post('/api/create-cashfree-order', async (req, res) => {
    try {
        const { orderId, orderAmount, orderCurrency, customerDetails, orderMeta, items } = req.body;

        const request = {
            order_id: orderId,
            order_amount: orderAmount,
            order_currency: orderCurrency,
            customer_details: customerDetails,
            order_meta: orderMeta,
            order_tags: { created_by: 'Node.js Server' }
        };

        const response = await cashfree.PGCreateOrder('2022-09-01', request);
        
        // Store order details locally
        const orders = await readOrders();
        orders[orderId] = {
            ...req.body,
            cashfreeOrderId: response.data.cf_order_id,
            paymentStatus: 'PENDING'
        };
        await writeOrders(orders);
        
        res.status(200).json({
            orderId: response.data.order_id,
            paymentSessionId: response.data.payment_session_id,
            return_url: response.data.order_meta.return_url
        });

    } catch (error) {
        console.error('Error creating Cashfree order:', error.response ? error.response.data : error.message);
        res.status(500).send({ error: 'Failed to create payment order' });
    }
});

// Webhook endpoint to receive payment status updates from Cashfree
app.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];
        const payload = JSON.stringify(req.body);

        const generatedSignature = crypto
            .createHmac('sha256', WEBHOOK_SECRET_KEY)
            .update(`${timestamp}${payload}`)
            .digest('base64');
        
        if (signature !== generatedSignature) {
            console.warn('Webhook signature verification failed.');
            return res.status(401).send('Unauthorized');
        }

        const { data } = req.body;
        const { order, payment } = data;
        const orderId = order.order_id;
        const paymentStatus = order.order_status;

        console.log(`Webhook received for order ${orderId}. Status: ${paymentStatus}`);

        // Update local order status
        const orders = await readOrders();
        if (orders[orderId]) {
            orders[orderId].paymentStatus = paymentStatus;
            orders[orderId].paymentDetails = payment;
            await writeOrders(orders);
        }
        
        res.status(200).send('Webhook received successfully');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send({ error: 'Webhook processing failed' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});