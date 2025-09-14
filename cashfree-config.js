// Cashfree Payment Gateway Configuration
// This file contains the configuration for integrating Cashfree payments

const CashfreeConfig = {
    // Environment Configuration
    environment: {
        // Set to 'production' for live payments, 'sandbox' for testing
        mode: 'sandbox', // Change to 'production' for live
        
        // Sandbox URLs
        sandbox: {
            apiUrl: 'https://sandbox.cashfree.com/pg',
            checkoutUrl: 'https://sandbox.cashfree.com/pg/web/checkout'
        },
        
        // Production URLs  
        production: {
            apiUrl: 'https://api.cashfree.com/pg',
            checkoutUrl: 'https://web.cashfree.com/checkout'
        }
    },
    
    // API Credentials (Replace with your actual credentials)
    credentials: {
        // Get these from your Cashfree dashboard
        appId: 'YOUR_CASHFREE_APP_ID', // Replace with actual App ID
        secretKey: 'YOUR_CASHFREE_SECRET_KEY' // Replace with actual Secret Key
    },
    
    // Payment Configuration
    payment: {
        // Currency (INR for Indian Rupees)
        currency: 'INR',
        
        // Payment components to show
        components: [
            'order-details',
            'card',
            'netbanking', 
            'app',
            'upi'
        ],
        
        // Payment mode
        paymentModes: {
            cc: true,      // Credit Card
            dc: true,      // Debit Card
            nb: true,      // Net Banking
            wallet: true,  // Wallets
            upi: true,     // UPI
            app: true      // Apps like PayTM, PhonePe etc
        }
    },
    
    // Webhook Configuration
    webhook: {
        // URL where Cashfree will send payment notifications
        // This should be your backend endpoint
        notifyUrl: 'https://yourwebsite.com/api/cashfree/webhook',
        
        // URL where customer will be redirected after payment
        returnUrl: 'https://yourwebsite.com/payment-success'
    },
    
    // Order Configuration
    order: {
        // Order prefix for generating order IDs
        orderPrefix: 'CHX',
        
        // Customer info requirements
        customerInfo: {
            required: ['name', 'email', 'phone']
        }
    }
};

// Production-ready Cashfree Integration Functions
class CashfreePayment {
    constructor(config = CashfreeConfig) {
        this.config = config;
        this.baseUrl = config.environment.mode === 'production' 
            ? config.environment.production.apiUrl 
            : config.environment.sandbox.apiUrl;
    }
    
    // Create order on your backend (this is a template)
    async createOrder(orderData) {
        try {
            // This should call your backend API that creates a Cashfree order
            const response = await fetch('/api/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: orderData.amount,
                    currency: this.config.payment.currency,
                    orderId: orderData.orderId,
                    customer: {
                        customerId: orderData.customerData.email,
                        customerName: orderData.customerData.name,
                        customerEmail: orderData.customerData.email,
                        customerPhone: orderData.customerData.phone
                    },
                    orderMeta: {
                        notifyUrl: this.config.webhook.notifyUrl,
                        returnUrl: this.config.webhook.returnUrl,
                        paymentModes: this.config.payment.paymentModes
                    }
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error creating order:', error);
            throw error;
        }
    }
    
    // Initialize payment session
    async initializePayment(orderData) {
        try {
            // Create order on backend first
            const order = await this.createOrder(orderData);
            
            // Initialize Cashfree checkout
            const checkoutOptions = {
                paymentSessionId: order.paymentSessionId,
                redirectTarget: '_self'
            };
            
            // Use Cashfree's SDK to open checkout
            window.Cashfree.checkout(checkoutOptions).then((result) => {
                if (result.error) {
                    this.handlePaymentError(result.error);
                } else {
                    this.handlePaymentSuccess(result);
                }
            });
            
        } catch (error) {
            this.handlePaymentError(error);
        }
    }
    
    // Handle successful payment
    handlePaymentSuccess(result) {
        console.log('Payment successful:', result);
        // Call your success handler
        if (window.handlePaymentSuccess) {
            window.handlePaymentSuccess(result);
        }
    }
    
    // Handle payment error
    handlePaymentError(error) {
        console.error('Payment failed:', error);
        // Call your error handler
        if (window.handlePaymentFailure) {
            window.handlePaymentFailure(error);
        }
    }
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CashfreeConfig, CashfreePayment };
}

// Make available globally for browser use
if (typeof window !== 'undefined') {
    window.CashfreeConfig = CashfreeConfig;
    window.CashfreePayment = CashfreePayment;
}