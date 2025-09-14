# Chocoluxe E-commerce Website

A fully mobile-optimized e-commerce website for artisan chocolates with integrated Cashfree payment gateway.

## Features

### ✅ Mobile-First Design
- Responsive design optimized for all screen sizes
- Touch-friendly interface with proper button sizing
- Mobile-optimized navigation with hamburger menu
- Sticky header with cart counter

### ✅ Enhanced Product Presentation
- Modern product cards with hover effects
- Prominent call-to-action buttons
- Organized product options (size, quantity)
- High-quality product images

### ✅ Professional Cart System
- Real-time cart updates with item counter
- Professional cart interface with item management
- Clear pricing and total calculations
- Empty cart state with continue shopping option

### ✅ Complete Checkout Flow
- Multi-step checkout process
- Customer information collection with validation
- Order summary and review
- Payment method selection (Online/COD)

### ✅ Payment Integration
- Cashfree payment gateway integration
- Support for Cards, UPI, Net Banking, Wallets
- Cash on Delivery option
- Professional order confirmation

### ✅ Business Integration
- WhatsApp integration for order notifications
- Structured order messages
- Customer details capture
- Order tracking with unique IDs

## Setup Instructions

### 1. Basic Setup
1. Clone or download the repository
2. Host the files on any web server
3. The website works with static hosting (GitHub Pages, Netlify, etc.)

### 2. Cashfree Payment Integration

#### Development/Testing
The website includes a demo payment system that simulates successful payments.

#### Production Setup
1. **Get Cashfree Credentials**
   - Sign up at [Cashfree Dashboard](https://merchant.cashfree.com)
   - Get your App ID and Secret Key from the dashboard
   - Note your webhook URL and return URL

2. **Configure Payment Settings**
   - Edit `cashfree-config.js`
   - Replace `YOUR_CASHFREE_APP_ID` with your actual App ID
   - Replace `YOUR_CASHFREE_SECRET_KEY` with your Secret Key
   - Set `mode: 'production'` for live payments

3. **Backend Integration Required**
   - Create a backend endpoint `/api/create-order` to create Cashfree orders
   - Handle webhook notifications at `/api/cashfree/webhook`
   - Store order details in your database

#### Sample Backend Code (Node.js/Express)

```javascript
const express = require('express');
const { Cashfree } = require('cashfree-pg');

// Initialize Cashfree
Cashfree.XClientId = "YOUR_APP_ID";
Cashfree.XClientSecret = "YOUR_SECRET_KEY";
Cashfree.XEnvironment = Cashfree.Environment.PRODUCTION; // or SANDBOX

app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, orderId, customer } = req.body;
    
    const orderRequest = {
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: customer.customerEmail,
        customer_name: customer.customerName,
        customer_email: customer.customerEmail,
        customer_phone: customer.customerPhone
      },
      order_meta: {
        return_url: "https://yourwebsite.com/payment-success",
        notify_url: "https://yourwebsite.com/api/cashfree/webhook"
      }
    };
    
    const response = await Cashfree.PGCreateOrder("2023-08-01", orderRequest);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 3. WhatsApp Integration
- Update the phone number in `script.js` (search for `919103436363`)
- Replace with your business WhatsApp number
- Messages are automatically formatted with order details

### 4. Customization

#### Update Business Details
- Edit `index.html` to update:
  - Business name and description
  - Contact information
  - Social media links
  - Footer information

#### Add/Remove Products
- Edit the product sections in `index.html`
- Update product images in the `Pictures` folder
- Modify pricing in the size options

#### Style Customization
- Edit `style.css` to customize:
  - Colors and branding
  - Fonts and typography
  - Button styles and effects
  - Layout and spacing

## File Structure

```
chocoluxe/
├── index.html              # Main website file
├── style.css              # Styling and responsive design
├── script.js              # Cart and checkout functionality
├── cashfree-config.js     # Payment gateway configuration
├── README.md              # This file
└── Pictures/              # Product images and assets
    ├── favicon files
    └── product images
```

## Browser Support
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers (iOS Safari, Android Chrome)

## Performance Features
- Optimized images
- Minimal JavaScript
- CSS-only animations
- Mobile-first loading

## Security Considerations
- Form validation on frontend and backend
- Secure payment processing through Cashfree
- No sensitive data stored in frontend
- HTTPS required for production

## Support
For technical support or customization requests:
- Review the code comments for implementation details
- Check browser console for any JavaScript errors
- Ensure all files are properly hosted and accessible

## License
This project is created for Chocoluxe by Iram. Modify as needed for your business requirements.