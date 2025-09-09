let cart = [];
let pendingCartItem = null; // Store the item being customized

function addToCart(name, price, quantity, size = 'regular') {
    // Store the pending item and show customization modal
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
    
    // Reset modal state
    input.value = '';
    charCount.textContent = '0';
    confirmBtn.disabled = false;
    
    modal.style.display = 'block';
    
    // Focus on input after modal is shown
    setTimeout(() => input.focus(), 100);
}

function hideCustomizationModal() {
    const modal = document.getElementById('customization-modal');
    modal.style.display = 'none';
    pendingCartItem = null;
}

function confirmCustomization() {
    const input = document.getElementById('customization-input');
    const customization = input.value.trim();
    
    if (customization.length === 0) {
        alert('Please enter a personalization message to continue with this luxury experience.');
        return;
    }
    
    // Add customization to the pending item and add to cart
    pendingCartItem.customization = customization;
    cart.push(pendingCartItem);
    
    updateCart();
    showToast(`${pendingCartItem.name} added to cart with personalization: "${customization}"`);
    hideCustomizationModal();
}

function removeItem(index) {
    cart.splice(index, 1); // Remove the item from the cart array
    updateCart(); // Update the cart display and total
}

function updateCart() {
    let cartItems = document.getElementById("cart-items");
    let total = 0;
    cartItems.innerHTML = "";

    cart.forEach((item, index) => {
        total += item.totalPrice;
        cartItems.innerHTML += `
            <p>${item.name} (Size: ${item.size}) x ${item.quantity} - ₹${item.totalPrice}<br>
            <span class="customization-text">✨ "${item.customization}"</span>
            <button onclick="removeItem(${index})">Remove</button></p>
        `;
    });

    document.getElementById("total").innerText = "Total: ₹" + total;
    document.getElementById("buy-btn").style.display = cart.length ? "inline-block" : "none";
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

function buyNow() {
    // Check if all items have customization (this should always be true now, but good to double-check)
    const missingCustomization = cart.filter(item => !item.customization || item.customization.trim() === '');
    
    if (missingCustomization.length > 0) {
        alert('All items must have personalization messages for this luxury experience. Please ensure all items are properly customized.');
        return;
    }
    
    let itemsInCart = cart.map(item => 
        `${item.name} (Size: ${item.size}) x ${item.quantity} - Personalization: "${item.customization}"`
    ).join(", ");
    let total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    window.location.href = `https://wa.me/919103436363?text=I want to buy: ${itemsInCart}. Total: ₹${total}`;
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

// Modal Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('customization-modal');
    const input = document.getElementById('customization-input');
    const charCount = document.getElementById('char-count');
    const confirmBtn = document.getElementById('confirm-customization');
    const cancelBtn = document.getElementById('cancel-customization');
    const closeBtn = document.querySelector('.close-modal');
    
    // Character counter
    input.addEventListener('input', function() {
        const length = this.value.length;
        charCount.textContent = length;
        
        // Disable confirm button if empty
        confirmBtn.disabled = length === 0;
        
        // Update character counter color based on length
        if (length > 12) {
            charCount.style.color = '#ff6584';
        } else {
            charCount.style.color = '#ff6584';
        }
    });
    
    // Modal close handlers
    cancelBtn.addEventListener('click', hideCustomizationModal);
    closeBtn.addEventListener('click', hideCustomizationModal);
    
    // Confirm customization
    confirmBtn.addEventListener('click', confirmCustomization);
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            hideCustomizationModal();
        }
    });
    
    // Handle Enter key in input
    input.addEventListener('keypress', function(event) {
        if (event.key === 'Enter' && !confirmBtn.disabled) {
            confirmCustomization();
        }
    });
});
