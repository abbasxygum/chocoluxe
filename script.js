let cart = [];

function addToCart(name, price, quantity, size = 'regular') {
    let totalPrice = price * quantity;  // Calculate total price for quantity
    cart.push({ name: name, price: price, quantity: quantity, size: size, totalPrice: totalPrice });
    updateCart();
    showToast(`${name} added to cart`);
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
            <p>${item.name} (Size: ${item.size}) x ${item.quantity} - ₹${item.totalPrice} 
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
    let itemsInCart = cart.map(item => `${item.name} (Size: ${item.size}) x ${item.quantity}`).join(", ");
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
