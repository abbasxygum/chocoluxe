let cart = [];
let pendingCartItem = null;

function addToCart(name, price, quantity, size = 'regular') {
    pendingCartItem = {
        name: name,
        price: price,
        quantity: quantity,
        size: size,
        totalPrice: price * quantity
    };
    showCustomizationModal();
}

function showCustomizationModal() {
    const modal = document.getElementById('customization-modal');
    const input = document.getElementById('customization-input');
    const charCount = document.getElementById('char-count');
    const confirmBtn = document.getElementById('confirm-customization');
    
    input.value = '';
    charCount.textContent = '0';
    confirmBtn.disabled = false;
    
    modal.style.display = 'block';
    setTimeout(() => input.focus(), 100);
}

function hideCustomizationModal() {
    document.getElementById('customization-modal').style.display = 'none';
    pendingCartItem = null;
}

function confirmCustomization() {
    const input = document.getElementById('customization-input');
    const customization = input.value.trim();
    
    if (customization.length === 0) {
        alert('Please enter a personalization message.');
        return;
    }
    
    pendingCartItem.customization = customization;
    cart.push(pendingCartItem);
    updateCart();
    showToast(`${pendingCartItem.name} added to cart with personalization: "${customization}"`);
    hideCustomizationModal();
    window.location.hash = '#cart';
    setTimeout(() => {
        const cartSection = document.getElementById('cart');
        if (cartSection) {
            cartSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 200);
}

function removeItem(index) {
    cart.splice(index, 1);
    updateCart();
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
        let payNowBtn = document.getElementById('pay-now-btn');
        if (payNowBtn) payNowBtn.style.display = 'none';
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
                <span class="cart-item-name">${item.name} (Size: ${item.size}) x ${item.quantity}</span><br>
                <span class="customization-text">✨ "${item.customization}"</span>
            </div>
            <span class="cart-item-price">₹${item.totalPrice}</span>
            <button class="remove-btn" data-index="${index}">Remove</button>
        `;
        cartItems.appendChild(cartItemDiv);
    });

    document.getElementById("total").innerText = `Total: ₹${total}`;
    document.getElementById("buy-btn").style.display = cart.length ? "inline-block" : "none";
    document.getElementById("clear-btn").style.display = cart.length ? "inline-block" : "none";

    let payNowBtn = document.getElementById('pay-now-btn');
    if (!payNowBtn) {
        payNowBtn = document.createElement('button');
        payNowBtn.id = 'pay-now-btn';
        payNowBtn.className = 'checkout-btn';
        payNowBtn.innerText = 'Pay Online';
        // This button in the cart summary can now use the main checkout flow
        payNowBtn.onclick = proceedToCheckout; 
        document.querySelector('.cart-actions').appendChild(payNowBtn);
    }
    payNowBtn.style.display = cart.length ? 'inline-block' : 'none';

    const removeBtns = cartItems.querySelectorAll('.remove-btn');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(btn.getAttribute('data-index'));
            removeItem(idx);
        });
    });
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
    document.body.style.overflow = 'hidden';
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('checkout-step-1').classList.add('active');
    document.getElementById('checkout-step-2').classList.remove('active');
}

function proceedToPayment() {
    const form = document.getElementById('customer-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    generateOrderSummary();
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

// --- MODIFIED SECTION STARTS HERE ---

function processPayment() {
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const customerData = getCustomerData(); // You already have this function, it's perfect!
    
    if (paymentMethod === 'online') {
        // We'll now call a dedicated function for online payments
        startOnlinePayment(customerData);
    } else {
        processCODOrder(customerData);
    }
}

function startOnlinePayment(customerData) {
    if (cart.length === 0) {
        showToast('Your cart is empty');
        return;
    }

    showToast('Connecting to our secure payment gateway...');

    // This is the data your server needs
    const orderPayload = {
        orderId: generateOrderId(), // Your function to create a unique ID like 'CHX...'
        orderAmount: cart.reduce((sum, item) => sum + item.totalPrice, 0),
        orderCurrency: 'INR',
        customerDetails: {
            customer_id: 'CUST_' + Date.now(), // Create a unique customer ID
            customer_name: customerData.name,
            customer_email: customerData.email,
            customer_phone: customerData.phone
        },
        orderMeta: {
            // This is just an example. Your server may override this.
            return_url: `http://127.0.0.1:5500/payment-status.html?order_id={order_id}`, 
        },
        items: cart
    };

    // This fetch call connects to YOUR backend (server.js)
    fetch('http://localhost:3000/api/create-cashfree-order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderPayload)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.paymentSessionId) {
            const cashfree = new window.Cashfree();
            // Redirects the user to Cashfree's checkout page
            cashfree.checkout({
                paymentSessionId: data.paymentSessionId,
                returnUrl: data.return_url, 
            });
        } else {
            throw new Error('Failed to get payment session ID');
        }
    })
    .catch(error => {
        console.error('Payment initiation failed:', error);
        showToast('Failed to start payment. Please try again.');
    });
}

// --- MODIFIED SECTION ENDS HERE ---

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
    
    const message = formatOrderForWhatsApp(orderDetails);
    cart = [];
    updateCart();
    updateCartCount();
    closeCheckoutModal();
    showToast('Order placed successfully! We will contact you soon.');
    window.open(`https://wa.me/919103436363?text=${encodeURIComponent(message)}`, '_blank');
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
        message += `  Personalization: "${item.customization}"\n`;
    });
    
    message += `\n*Total Amount: ₹${orderDetails.total}*\n`;
    message += `*Payment Method: ${orderDetails.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment via Cashfree'}*\n\n`;
    message += `Please confirm this order and share payment details/instructions. Expected delivery time?`;
    
    return message;
}

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
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 12px 20px;
        border-radius: 5px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: Arial, sans-serif;
        max-width: 300px;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 4000);
}

function buyNow() {
    const missingCustomization = cart.filter(item => !item.customization || item.customization.trim() === '');
    if (missingCustomization.length > 0) {
        alert('All items must have personalization messages.');
        return;
    }
    let itemsInCart = cart.map(item => 
        `${item.name} (Size: ${item.size}) x ${item.quantity} - Personalization: "${item.customization}"`
    ).join(", ");
    let total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    window.location.href = `https://wa.me/919103436363?text=I want to buy: ${itemsInCart}. Total: ₹${total}`;
}

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
            price = 499;
            break;
    }
    return price;
}

let slides = document.querySelectorAll(".slide");
let currentSlide = 0;
let slideInterval = setInterval(nextSlide, 1500);

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

document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('customization-modal');
    const input = document.getElementById('customization-input');
    const charCount = document.getElementById('char-count');
    const confirmBtn = document.getElementById('confirm-customization');
    const cancelBtn = document.getElementById('cancel-customization');
    const closeBtn = document.querySelector('.close-modal');
    
    input.addEventListener('input', function() {
        const length = this.value.length;
        charCount.textContent = length;
        confirmBtn.disabled = length === 0;
        charCount.style.color = length > 12 ? '#ff6584' : '#ff6584';
    });
    
    cancelBtn.addEventListener('click', hideCustomizationModal);
    closeBtn.addEventListener('click', hideCustomizationModal);
    confirmBtn.addEventListener('click', confirmCustomization);
    
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            hideCustomizationModal();
        }
    });
    
    input.addEventListener('keypress', function(event) {
        if (event.key === 'Enter' && !confirmBtn.disabled) {
            confirmCustomization();
        }
    });
});