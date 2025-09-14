const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.post('/api/create-cashfree-order', async (req, res) => {
    try {
        const response = await axios.post('https://api.cashfree.com/pg/orders', {
            order_id: req.body.orderId,
            order_amount: req.body.orderAmount,
            order_currency: req.body.orderCurrency,
            customer_details: req.body.customerDetails,
            order_meta: req.body.orderMeta
        }, {
            headers: {
                'x-api-version': '2023-08-01',
                'x-client-id': '10703336d38e2943b7ffca3fd5f3330701',
                'x-client-secret': 'cfsk_ma_prod_d9a458e717513c9cb9c1b35334823edb_1da83c2b'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create order' });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));