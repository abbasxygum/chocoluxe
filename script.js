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
    
    // For now, keep the WhatsApp functionality but make it more professional
    let itemsInCart = cart.map(item => `${item.name} (Size: ${item.size}) x ${item.quantity} - ₹${item.totalPrice}`).join('\n');
    let total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    let message = `Hello! I would like to place an order:\n\n${itemsInCart}\n\nTotal Amount: ₹${total}\n\nPlease confirm the order and share payment details.`;
    
    window.location.href = `https://wa.me/919103436363?text=${encodeURIComponent(message)}`;
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
