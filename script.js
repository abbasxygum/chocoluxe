let cart = [];

// Mobile menu functionality
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mainNav = document.getElementById('main-nav');
    
    mobileMenuToggle.addEventListener('click', function() {
        mainNav.classList.toggle('active');
    });
    
    // Close menu when clicking on a nav link
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            mainNav.classList.remove('active');
        });
    });
});

function addToCart(name, price, quantity, size = 'regular') {
    let totalPrice = price * quantity;  // Calculate total price for quantity
    cart.push({ name: name, price: price, quantity: quantity, size: size, totalPrice: totalPrice });
    updateCart();
    updateCartCount();
    showToast(`${name} added to cart`);
}

function removeItem(index) {
    cart.splice(index, 1); // Remove the item from the cart array
    updateCart(); // Update the cart display and total
    updateCartCount();
}

function updateCartCount() {
    const cartCount = document.getElementById('cart-count');
    const totalItems = cart.reduce((sum, item) => sum + parseInt(item.quantity), 0);
    cartCount.textContent = totalItems;
    cartCount.style.display = totalItems > 0 ? 'inline' : 'none';
}

function updateCart() {
    const cartItems = document.getElementById("cart-items");
    const emptyCart = document.getElementById("empty-cart");
    const cartSummary = document.getElementById("cart-summary");
    let total = 0;
    cartItems.innerHTML = "";

    if (cart.length === 0) {
        emptyCart.style.display = "block";
        cartSummary.style.display = "none";
        return;
    }

    emptyCart.style.display = "none";
    cartSummary.style.display = "block";

    cart.forEach((item, index) => {
        total += item.totalPrice;
        const cartItemDiv = document.createElement('div');
        cartItemDiv.className = 'cart-item';
        cartItemDiv.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-details">Size: ${item.size} | Qty: ${item.quantity}</div>
            </div>
            <div class="cart-item-price">₹${item.totalPrice}</div>
            <button class="remove-btn" onclick="removeItem(${index})">Remove</button>
        `;
        cartItems.appendChild(cartItemDiv);
    });

    document.getElementById("total").innerText = `Total: ₹${total}`;
    document.getElementById("buy-btn").style.display = cart.length ? "inline-block" : "none";
    document.getElementById("clear-btn").style.display = cart.length ? "inline-block" : "none";
}

function clearCart() {
    if (confirm('Are you sure you want to clear your cart?')) {
        cart = [];
        updateCart();
        updateCartCount();
        showToast('Cart cleared');
    }
}

function proceedToCheckout() {
    if (cart.length === 0) {
        showToast('Your cart is empty');
        return;
    }
    
    document.getElementById('checkout-modal').style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent scrolling behind modal
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    // Reset to step 1
    document.getElementById('checkout-step-1').classList.add('active');
    document.getElementById('checkout-step-2').classList.remove('active');
}

function proceedToPayment() {
    // Validate customer form
    const form = document.getElementById('customer-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Generate order summary
    generateOrderSummary();
    
    // Move to step 2
    document.getElementById('checkout-step-1').classList.remove('active');
    document.getElementById('checkout-step-2').classList.add('active');
}

function goBackToInfo() {
    document.getElementById('checkout-step-2').classList.remove('active');
    document.getElementById('checkout-step-1').classList.add('active');
}

function generateOrderSummary() {
    const orderSummary = document.getElementById('order-summary');
    let html = '<h4>Order Details</h4>';
    let total = 0;
    
    cart.forEach(item => {
        total += item.totalPrice;
        html += `
            <div class="order-item">
                <span>${item.name} (${item.size}) x ${item.quantity}</span>
                <span>₹${item.totalPrice}</span>
            </div>
        `;
    });
    
    html += `
        <div class="order-item">
            <span><strong>Total Amount</strong></span>
            <span><strong>₹${total}</strong></span>
        </div>
    `;
    
    orderSummary.innerHTML = html;
}

function processPayment() {
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const customerData = getCustomerData();
    
    if (paymentMethod === 'cod') {
        // Handle Cash on Delivery
        processCODOrder(customerData);
    } else {
        // Handle Online Payment via Cashfree
        processCashfreePayment(customerData);
    }
}

function getCustomerData() {
    return {
        name: document.getElementById('customer-name').value,
        email: document.getElementById('customer-email').value,
        phone: document.getElementById('customer-phone').value,
        address: document.getElementById('customer-address').value,
        city: document.getElementById('customer-city').value,
        pincode: document.getElementById('customer-pincode').value,
        instructions: document.getElementById('special-instructions').value
    };
}

function processCODOrder(customerData) {
    const total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const orderDetails = {
        items: cart,
        customer: customerData,
        total: total,
        paymentMethod: 'cod',
        orderId: generateOrderId()
    };
    
    // For now, send to WhatsApp with detailed order info
    const message = formatOrderForWhatsApp(orderDetails);
    
    // Clear cart and close modal
    cart = [];
    updateCart();
    updateCartCount();
    closeCheckoutModal();
    
    showToast('Order placed successfully! We will contact you soon.');
    
    // Send to WhatsApp
    window.open(`https://wa.me/919103436363?text=${encodeURIComponent(message)}`, '_blank');
}

function processCashfreePayment(customerData) {
    const total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const orderId = generateOrderId();
    
    // Cashfree integration
    initiateeCashfreePayment({
        orderId: orderId,
        amount: total,
        customerData: customerData,
        items: cart
    });
}

function initiateeCashfreePayment(orderData) {
    // This is a demo implementation - in production, you'd call your backend
    // which would create a Cashfree order and return payment session details
    
    showToast('Redirecting to payment gateway...');
    
    // Demo Cashfree integration
    const cashfreeConfig = {
        mode: "sandbox", // Change to "production" for live
        components: ["order-details", "card", "netbanking", "app", "upi"],
        onSuccess: function(data) {
            handlePaymentSuccess(data, orderData);
        },
        onFailure: function(data) {
            handlePaymentFailure(data);
        },
        onNavigateBack: function(data) {
            showToast('Payment cancelled');
        }
    };
    
    // For demo purposes, simulate a successful payment after 2 seconds
    setTimeout(() => {
        handlePaymentSuccess({
            paymentSessionId: 'demo_' + Date.now(),
            orderId: orderData.orderId
        }, orderData);
    }, 2000);
}

function handlePaymentSuccess(paymentData, orderData) {
    // Clear cart and close modal
    cart = [];
    updateCart();
    updateCartCount();
    closeCheckoutModal();
    
    // Show success message
    showToast('Payment successful! Your order has been confirmed.');
    
    // Send confirmation to WhatsApp
    const confirmationMessage = formatOrderConfirmation(orderData, paymentData);
    setTimeout(() => {
        window.open(`https://wa.me/919103436363?text=${encodeURIComponent(confirmationMessage)}`, '_blank');
    }, 1000);
}

function handlePaymentFailure(data) {
    showToast('Payment failed. Please try again.');
    console.error('Payment failed:', data);
}

function generateOrderId() {
    return 'CHX' + Date.now() + Math.floor(Math.random() * 1000);
}

function formatOrderForWhatsApp(orderDetails) {
    let message = `🍫 *New Order - ${orderDetails.orderId}*\n\n`;
    message += `*Customer Details:*\n`;
    message += `Name: ${orderDetails.customer.name}\n`;
    message += `Email: ${orderDetails.customer.email}\n`;
    message += `Phone: ${orderDetails.customer.phone}\n`;
    message += `Address: ${orderDetails.customer.address}, ${orderDetails.customer.city} - ${orderDetails.customer.pincode}\n`;
    
    if (orderDetails.customer.instructions) {
        message += `Special Instructions: ${orderDetails.customer.instructions}\n`;
    }
    
    message += `\n*Order Items:*\n`;
    orderDetails.items.forEach(item => {
        message += `• ${item.name} (${item.size}) x ${item.quantity} = ₹${item.totalPrice}\n`;
    });
    
    message += `\n*Total Amount: ₹${orderDetails.total}*\n`;
    message += `*Payment Method: ${orderDetails.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}*\n\n`;
    message += `Please confirm this order and share expected delivery time.`;
    
    return message;
}

function formatOrderConfirmation(orderData, paymentData) {
    let message = `✅ *Payment Confirmation - ${orderData.orderId}*\n\n`;
    message += `Payment ID: ${paymentData.paymentSessionId}\n`;
    message += `Amount Paid: ₹${orderData.amount}\n`;
    message += `Customer: ${orderData.customerData.name}\n`;
    message += `Phone: ${orderData.customerData.phone}\n\n`;
    message += `This order has been paid online successfully. Please process and ship the order.`;
    
    return message;
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('checkout-modal');
    if (event.target === modal) {
        closeCheckoutModal();
    }
}

function showToast(message) {
    let toast = document.createElement('div');
    toast.classList.add('toast');
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}


// Function to get price based on size selected (in Collection section)
function getPriceCollection(sizeId) {
    let size = document.getElementById(sizeId).value;
    let price = 0;
    switch (size) {
        case 'small':
            price = 499;
            break;
        case 'medium':
            price = 749;
            break;
        case 'large':
            price = 1380;
            break;
        default:
            price = 499; // Default to Small size if no selection
            break;
    }
    return price;
}
// Slider functionality
let slides = document.querySelectorAll(".slide");
let currentSlide = 0;
let slideInterval = setInterval(nextSlide, 1500); // Slide every 1.5 seconds

function showSlide(index) {
    slides.forEach(slide => slide.classList.remove("active"));
    slides[index].classList.add("active");
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
}

function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    showSlide(currentSlide);
}

document.getElementById("next").addEventListener("click", () => {
    nextSlide();
    resetInterval();
});

document.getElementById("prev").addEventListener("click", () => {
    prevSlide();
    resetInterval();
});

function resetInterval() {
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSlide, 1500);
}
