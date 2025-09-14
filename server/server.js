// Chocoluxe Cashfree Payment Backend Example
// Install dependencies: npm install express cashfree-pg cors

const express = require('express');
const cors = require('cors');
const { Cashfree } = require('cashfree-pg');

const app = express();
app.use(express.json());
app.use(cors());

const CASHFREE_APP_ID = '10703336d38e2943b7ffca3fd5f3330701';
const CASHFREE_SECRET_KEY = 'cfsk_ma_prod_d9a458e717513c9cb9c1b35334823edb_1da83c2b';
const CASHFREE_ENV = 'PROD'; // Use 'TEST' for sandbox

Cashfree.XClientId = CASHFREE_APP_ID;
Cashfree.XClientSecret = CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = CASHFREE_ENV;

// Endpoint to create order and return session token
app.post('/create-order', async (req, res) => {
    try {
        const { orderId, amount, customer } = req.body;
        const orderPayload = {
            order_id: orderId,
            order_amount: amount,
            order_currency: 'INR',
            customer_details: {
                customer_id: customer.email || 'guest',
                customer_email: customer.email || '',
                customer_phone: customer.phone || '',
                customer_name: customer.name || 'Guest'
            }
        };
        // Create order
        const orderResponse = await Cashfree.PGOrder.createOrder(orderPayload);
        if (orderResponse && orderResponse.data && orderResponse.data.payment_session_id) {
            res.json({
                paymentSessionId: orderResponse.data.payment_session_id,
                orderId: orderId
            });
        } else {
            res.status(500).json({ error: 'Failed to create order', details: orderResponse });
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Cashfree backend running on port ${PORT}`);
});
