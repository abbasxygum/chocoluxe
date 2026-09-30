const API = '/api';
const CART_KEY = 'chx_cart';
const MAX_MESSAGE = 50;
const MAX_NOTE = 500;
const MAX_QTY = 20;
const FREE_SHIPPING_OVER = 2000;
const SHIPPING_COST = 99;
const TAX_RATE = 0.05;

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const escapeHtml = (str) =>
    String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
    products: [],
    categories: [],
    cart: [],
    activeCategory: 'all',
    search: '',
    pendingProduct: null,
    heroIndex: 0,
    heroTimer: null
};

/* ------------------------------------------------------------------ *
 * Cart storage
 * ------------------------------------------------------------------ */

function loadCart() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        state.cart = Array.isArray(parsed) ? parsed : [];
    } catch {
        state.cart = [];
    }
}

function saveCart() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch {
        showToast('Could not save your basket — storage may be full');
    }
}

const cartCount = () => state.cart.reduce((sum, item) => sum + item.quantity, 0);
const cartSubtotal = () => state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });

    let data = {};
    try {
        data = await res.json();
    } catch {
        /* empty body */
    }

    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
    return data;
}

async function loadCatalog() {
    const [{ products }, { categories }] = await Promise.all([
        api('/products'),
        api('/products/categories').catch(() => ({ categories: [] }))
    ]);

    state.products = products || [];
    state.categories = categories || [];
    renderCategories();
    renderProducts();
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

function renderCategories() {
    const chips = $('#category-chips');
    if (!chips) return;

    const counts = state.products.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
    }, {});

    const bySlug = new Map(state.categories.map((c) => [c.slug, c]));
    const active = state.products
        .filter((p) => !bySlug.has(p.category))
        .map((p) => p.category);

    const options = [
        { slug: 'all', label: 'Everything', icon: '', count: state.products.length },
        ...state.categories
            .filter((c) => counts[c.slug])
            .map((c) => ({ ...c, count: counts[c.slug] })),
        ...active.map((slug) => ({
            slug,
            label: slug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
            icon: '',
            count: counts[slug]
        }))
    ];

    chips.innerHTML = options
        .map(
            (c) => `
        <button class="chip" role="tab" data-cat="${escapeHtml(c.slug)}"
                aria-selected="${state.activeCategory === c.slug}">
            ${c.icon ? `<span aria-hidden="true">${escapeHtml(c.icon)}</span>` : ''}
            ${escapeHtml(c.label)} <span class="chip-count">${c.count}</span>
        </button>`
        )
        .join('');

    $$('.chip', chips).forEach((chip) => {
        chip.addEventListener('click', () => {
            state.activeCategory = chip.dataset.cat;
            renderCategories();
            renderProducts();
        });
    });
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

function visibleProducts() {
    const term = state.search.trim().toLowerCase();

    return state.products.filter((p) => {
        if (state.activeCategory !== 'all' && p.category !== state.activeCategory) return false;
        if (!term) return true;
        return [p.name, p.tagline, p.description, p.category]
            .filter(Boolean)
            .some((field) => field.toLowerCase().includes(term));
    });
}

function categoryLabel(slug) {
    const found = state.categories.find((c) => c.slug === slug);
    return found
        ? found.label
        : slug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function renderStars(rating) {
    const rounded = Math.round(Number(rating) || 0);
    const full = '★'.repeat(rounded);
    const off = '★'.repeat(Math.max(0, 5 - rounded));
    return `<span class="stars" aria-hidden="true">${full}<span class="off">${off}</span></span>`;
}

function productMedia(p) {
    const img = (p.images || []).find(Boolean);

    if (img) {
        return `<img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy"
                     onerror="this.remove()">`;
    }

    return `<div class="photo-placeholder">
        <span class="ph-icon" aria-hidden="true">${escapeHtml(categoryIcon(p.category))}</span>
        <span class="ph-name">${escapeHtml(p.name)}</span>
        <span class="ph-note">coming soon</span>
    </div>`;
}

function categoryIcon(slug) {
    const found = state.categories.find((c) => c.slug === slug);
    if (found?.icon) return found.icon;
    return { bars: '🍫', bonbons: '🧁', lollipops: '🍭', bites: '🥨', fudge: '🍮', drinks: '☕' }[slug] || '🍫';
}

function productCard(p) {
    const sizes = Object.entries(p.sizes || {});
    const soldOut = Number(p.stock_quantity) <= 0;
    const lowStock = !soldOut && Number(p.stock_quantity) <= 10;
    const prices = sizes.map(([, price]) => Number(price) || 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    const badgeClass = /sale|offer|% off/i.test(p.badge || '') ? 'sale' : '';

    const stockNote = soldOut
        ? '<p class="stock-note out">Out of stock — join us on Instagram for the next batch</p>'
        : lowStock
            ? `<p class="stock-note low">Only ${p.stock_quantity} left today</p>`
            : '';

    const sizeButtons = sizes
        .map(
            ([label, price], i) => `
        <button class="size-opt" data-product="${p.id}" data-size="${escapeHtml(label)}"
                aria-pressed="${i === 0}">
            ${escapeHtml(label)}<span class="size-price">${rupees(price)}</span>
        </button>`
        )
        .join('');

    return `
    <article class="product-card" data-id="${p.id}">
        <div class="product-media">
            ${productMedia(p)}
            ${p.badge ? `<span class="product-badge ${badgeClass}">${escapeHtml(p.badge)}</span>` : ''}
            ${soldOut ? '<div class="product-soldout"><span>Sold out</span></div>' : ''}
        </div>
        <div class="product-body">
            <p class="product-cat">${escapeHtml(categoryLabel(p.category))}</p>
            <h3 class="product-name">${escapeHtml(p.name)}</h3>
            ${p.tagline ? `<p class="product-tagline">${escapeHtml(p.tagline)}</p>` : ''}
            ${Number(p.rating_count) > 0
                ? `<div class="product-rating">${renderStars(p.rating)}
                     <span>${Number(p.rating).toFixed(1)} (${p.rating_count})</span></div>`
                : ''}
            <p class="product-price">${rupees(minPrice)}</p>
            ${minPrice !== maxPrice ? `<p class="price-range">up to ${rupees(maxPrice)}</p>` : '<p class="price-range">&nbsp;</p>'}
            ${stockNote}
            <div class="size-picker">${sizeButtons}</div>
            <div class="product-actions">
                <button class="btn btn-clay btn-sm" data-add="${p.id}" ${soldOut ? 'disabled' : ''}>
                    ${soldOut ? 'Sold out' : 'Add to basket'}
                </button>
            </div>
        </div>
    </article>`;
}

function renderProducts() {
    const grid = $('#product-grid');
    const empty = $('#shop-empty');
    const count = $('#shop-count');
    const list = visibleProducts();

    if (grid) grid.innerHTML = list.map(productCard).join('');
    if (empty) empty.hidden = list.length > 0;

    if (count) {
        const catLabel = state.activeCategory === 'all'
            ? 'everything'
            : categoryLabel(state.activeCategory).toLowerCase();
        count.textContent = list.length
            ? `${list.length} ${list.length === 1 ? 'treat' : 'treats'} in ${catLabel}`
            : 'No treats match that just now';
    }

    wireProductCards();
}

function selectedSize(card) {
    const active = card.querySelector('.size-opt[aria-pressed="true"]');
    return active ? active.dataset.size : '';
}

function wireProductCards() {
    $$('.product-card').forEach((card) => {
        const id = Number(card.dataset.id);

        $$('.size-opt', card).forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('.size-opt', card).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
            });
        });

        const addBtn = card.querySelector('[data-add]');
        if (addBtn && !addBtn.disabled) {
            addBtn.addEventListener('click', () => {
                const product = state.products.find((p) => p.id === id);
                if (!product) return;
                openMessageModal(product, selectedSize(card));
            });
        }
    });
}

/* ------------------------------------------------------------------ *
 * Personalisation modal
 * ------------------------------------------------------------------ */

function openMessageModal(product, size) {
    state.pendingProduct = { product, size };

    $('#message-product-name').textContent = product.name;
    const input = $('#message-input');
    input.value = '';
    input.maxLength = MAX_MESSAGE;
    updateMessageUI();
    $('#message-modal').hidden = false;
    setTimeout(() => input.focus(), 60);
}

function updateMessageUI() {
    const value = $('#message-input').value;
    $('#message-count').textContent = value.length;
    $('#message-preview-text').textContent = value || (state.pendingProduct?.product.name || 'Your message');
}

function closeMessageModal() {
    $('#message-modal').hidden = true;
    state.pendingProduct = null;
}

function commitAdd(message) {
    const pending = state.pendingProduct;
    if (!pending) return;

    const { product, size } = pending;
    const label = size || Object.keys(product.sizes || {})[0];
    const price = Number(product.sizes?.[label]) || Number(product.base_price) || 0;

    const existing = state.cart.find(
        (i) => i.id === product.id && i.size === label && i.message === message
    );

    if (existing) {
        if (existing.quantity >= MAX_QTY) {
            showToast(`Only ${MAX_QTY} of one item per order, sorry`);
            return;
        }
        existing.quantity += 1;
    } else {
        state.cart.push({
            id: product.id,
            name: product.name,
            image: (product.images || []).find(Boolean) || '',
            size: label,
            price,
            quantity: 1,
            message
        });
    }

    saveCart();
    renderCart();
    bumpCart();
    closeMessageModal();
    showToast(message ? 'Added with your message' : 'Added to your basket');
}

/* ------------------------------------------------------------------ *
 * Cart drawer
 * ------------------------------------------------------------------ */

function renderCart() {
    const list = $('#cart-items');
    const empty = $('#cart-empty');
    const summary = $('#cart-summary');
    const count = cartCount();

    $('#cart-count').textContent = count;

    if (!state.cart.length) {
        if (list) list.innerHTML = '';
        if (empty) empty.hidden = false;
        if (summary) summary.hidden = true;
        return;
    }

    if (empty) empty.hidden = true;
    if (summary) summary.hidden = false;

    if (list) {
        list.innerHTML = state.cart
            .map(
                (item, i) => `
        <div class="cart-item" data-index="${i}">
            ${item.image
                ? `<img class="cart-item-img" src="${escapeHtml(item.image)}" alt="">`
                : '<div class="cart-item-img placeholder" aria-hidden="true">🍫</div>'}
            <div>
                <p class="cart-item-name">${escapeHtml(item.name)}</p>
                <p class="cart-item-meta">${escapeHtml(item.size)} &middot; ${rupees(item.price)} each</p>
                ${item.message
                    ? `<p class="cart-item-msg"><span class="tag">Message</span><em>&ldquo;${escapeHtml(item.message)}&rdquo;</em></p>`
                    : ''}
                <div class="cart-item-row">
                    <div class="qty-picker">
                        <button data-dec="${i}" aria-label="Decrease quantity">&minus;</button>
                        <span>${item.quantity}</span>
                        <button data-inc="${i}" aria-label="Increase quantity">+</button>
                    </div>
                    <span class="cart-item-price">${rupees(item.price * item.quantity)}</span>
                </div>
                <button class="cart-item-remove" data-remove="${i}">Remove</button>
            </div>
        </div>`
            )
            .join('');
    }

    const subtotal = cartSubtotal();
    const shipping = subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_COST;
    const tax = Math.round(subtotal * TAX_RATE);

    $('#subtotal').textContent = rupees(subtotal);
    $('#shipping').textContent = shipping ? rupees(shipping) : 'Free';
    $('#tax').textContent = rupees(tax);
    $('#cart-total').textContent = rupees(subtotal + shipping + tax);

    const hint = $('#ship-hint');
    if (hint) {
        const away = FREE_SHIPPING_OVER - subtotal;
        hint.textContent = away > 0
            ? `Add ${rupees(away)} more for free delivery`
            : 'Free delivery unlocked';
    }
}

function wireCart() {
    $('#cart-items').addEventListener('click', (e) => {
        const inc = e.target.closest('[data-inc]');
        const dec = e.target.closest('[data-dec]');
        const remove = e.target.closest('[data-remove]');

        if (inc) changeQty(Number(inc.dataset.inc), 1);
        if (dec) changeQty(Number(dec.dataset.dec), -1);
        if (remove) {
            state.cart.splice(Number(remove.dataset.remove), 1);
            saveCart();
            renderCart();
        }
    });
}

function changeQty(index, delta) {
    const item = state.cart[index];
    if (!item) return;

    item.quantity += delta;
    if (item.quantity > MAX_QTY) {
        item.quantity = MAX_QTY;
        showToast(`Maximum ${MAX_QTY} of one item per order`);
    }
    if (item.quantity < 1) {
        state.cart.splice(index, 1);
    }

    saveCart();
    renderCart();
}

function openCart() {
    $('#cart-drawer').classList.add('open');
    $('#cart-drawer').setAttribute('aria-hidden', 'false');
    $('#drawer-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    $('#cart-drawer').classList.remove('open');
    $('#cart-drawer').setAttribute('aria-hidden', 'true');
    $('#drawer-backdrop').classList.remove('open');
    document.body.style.overflow = '';
}

function bumpCart() {
    const badge = $('#cart-badge');
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
}

/* ------------------------------------------------------------------ *
 * Checkout
 * ------------------------------------------------------------------ */

function openCheckout() {
    if (!state.cart.length) return;
    closeCart();
    $('#checkout-step-1').hidden = false;
    $('#checkout-step-2').hidden = true;
    $$('#checkout-steps .dot').forEach((d, i) => d.classList.toggle('active', i === 0));
    $('#checkout-modal').hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeCheckout() {
    $('#checkout-modal').hidden = true;
    document.body.style.overflow = '';
}

function buildSummary() {
    const subtotal = cartSubtotal();
    const shipping = subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_COST;
    const tax = Math.round(subtotal * TAX_RATE);
    const note = $('#order-note').value.trim();

    const items = state.cart
        .map(
            (i) => `
        <div class="summary-item">
            <span class="price">${rupees(i.price * i.quantity)}</span>
            <strong>${escapeHtml(i.name)} &times; ${i.quantity}</strong>
            <div class="meta">${escapeHtml(i.size)}</div>
            ${i.message ? `<div class="msg">&ldquo;${escapeHtml(i.message)}&rdquo;</div>` : ''}
        </div>`
        )
        .join('');

    $('#order-summary').innerHTML = `
        ${items}
        ${note ? `<div class="summary-note"><strong>Delivery note</strong>${escapeHtml(note)}</div>` : ''}
        <div class="totals" style="margin-top:16px">
            <div class="total-row"><span>Subtotal</span><span>${rupees(subtotal)}</span></div>
            <div class="total-row"><span>Delivery</span><span>${shipping ? rupees(shipping) : 'Free'}</span></div>
            <div class="total-row"><span>GST (5%)</span><span>${rupees(tax)}</span></div>
            <div class="total-row total"><span>Total</span><span>${rupees(subtotal + shipping + tax)}</span></div>
        </div>`;
}

function validateDetails() {
    const fields = [
        ['#customer-name', 'name'],
        ['#customer-phone', 'phone'],
        ['#customer-email', 'email'],
        ['#customer-address', 'address'],
        ['#customer-city', 'city'],
        ['#customer-pincode', 'pincode']
    ];

    for (const [sel, label] of fields) {
        const el = $(sel);
        if (!el.value.trim()) {
            el.focus();
            showToast(`Please add your ${label}`);
            return false;
        }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#customer-email').value.trim())) {
        $('#customer-email').focus();
        showToast('That email address does not look right');
        return false;
    }

    if (!/^[0-9]{6}$/.test($('#customer-pincode').value.trim())) {
        $('#customer-pincode').focus();
        showToast('Pincode should be 6 digits');
        return false;
    }

    return true;
}

async function placeOrder() {
    const method = $('input[name="payment"]:checked')?.value;
    if (!method) {
        showToast('Pick how you would like to pay');
        return;
    }

    const btn = $('#place-order');
    btn.disabled = true;
    btn.textContent = 'Placing your order…';

    try {
        const payload = {
            items: state.cart.map((i) => ({
                id: i.id,
                name: i.name,
                size: i.size,
                quantity: i.quantity,
                message: i.message
            })),
            customerName: $('#customer-name').value.trim(),
            customerEmail: $('#customer-email').value.trim(),
            customerPhone: $('#customer-phone').value.trim(),
            customerAddress: $('#customer-address').value.trim(),
            customerCity: $('#customer-city').value.trim(),
            customerPincode: $('#customer-pincode').value.trim(),
            specialInstructions: $('#order-note').value.trim().slice(0, MAX_NOTE),
            paymentMethod: method
        };

        const { order } = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });

        if (method === 'online') {
            const { paymentSessionId } = await api('/payment/create-session', {
                method: 'POST',
                body: JSON.stringify({ orderId: order.order_id })
            });
            await startCashfree(paymentSessionId, order);
            return;
        }

        finishOrder(order, 'cod');
    } catch (err) {
        showToast(err.message || 'Could not place your order');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Place order';
    }
}

async function startCashfree(sessionId, order) {
    try {
        const res = await fetch('https://sdk.cashfree.com/js/v3/cashfree.js');
        if (!res.ok) throw new Error('Payment window could not load');
        const cashfree = window.Cashfree({ mode: 'sandbox', checkout: { merge: true } });

        const result = await cashfree.initEmbeddedCheckout(sessionId, {
            return: {
                type: 'redirect',
                url: `${window.location.origin}/payment-status.html?order_id=${order.order_id}`
            }
        });

        if (result?.error) throw new Error(result.error.message || 'Payment could not start');
    } catch (err) {
        showToast(err.message || 'Payment could not start');
    }
}

function finishOrder(order, method) {
    state.cart = [];
    saveCart();
    renderCart();
    closeCheckout();

    $('#success-title').textContent = method === 'cod' ? 'Order placed!' : 'Thank you!';
    $('#success-text').textContent = method === 'cod'
        ? "We're already making it. You'll get a call to confirm the address."
        : 'Payment received — your chocolates are on the way.';
    $('#success-order').innerHTML = `
        <div><strong>Order</strong> &nbsp;${escapeHtml(order.order_id)}</div>
        <div><strong>Total</strong> &nbsp;${rupees(order.total_amount)}</div>
        <div><strong>Paying by</strong> &nbsp;${method === 'cod' ? 'Cash on delivery' : 'Online payment'}</div>`;

    $('#success-modal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#order-form').reset();
    $('#note-count').textContent = '0';
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

function setSearch(term) {
    state.search = term;
    $('#product-search').value = term;
    $('#search-bar-input').value = term;

    if (term && !isInView($('#shop'))) {
        $('#shop').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    renderProducts();
}

function openSearch() {
    const bar = $('#search-bar');
    bar.hidden = false;
    setTimeout(() => $('#search-bar-input').focus(), 40);
}

function closeSearch() {
    $('#search-bar').hidden = true;
}

function isInView(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top <= 120 && rect.bottom >= 0;
}

/* ------------------------------------------------------------------ *
 * Hero slider
 * ------------------------------------------------------------------ */

function goToSlide(index) {
    const slides = $$('#hero-slider .slide');
    if (!slides.length) return;

    state.heroIndex = (index + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === state.heroIndex));
}

function startHero() {
    clearInterval(state.heroTimer);
    state.heroTimer = setInterval(() => goToSlide(state.heroIndex + 1), 6000);
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

let toastTimer;
function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* ------------------------------------------------------------------ *
 * Wire up
 * ------------------------------------------------------------------ */

function init() {
    $('#year').textContent = new Date().getFullYear();
    loadCart();
    renderCart();

    $('#cart-badge').addEventListener('click', openCart);
    $('#close-cart').addEventListener('click', closeCart);
    $('#drawer-backdrop').addEventListener('click', closeCart);
    $('#continue-shopping').addEventListener('click', closeCart);
    wireCart();

    $('#checkout-btn').addEventListener('click', openCheckout);
    $('#back-to-info').addEventListener('click', () => {
        $('#checkout-step-1').hidden = false;
        $('#checkout-step-2').hidden = true;
        $$('#checkout-steps .dot').forEach((d, i) => d.classList.toggle('active', i === 0));
    });
    $('#place-order').addEventListener('click', placeOrder);

    $('#order-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!validateDetails()) return;
        buildSummary();
        $('#checkout-step-1').hidden = true;
        $('#checkout-step-2').hidden = false;
        $$('#checkout-steps .dot').forEach((d, i) => d.classList.toggle('active', i === 1));
    });

    const note = $('#order-note');
    note.addEventListener('input', () => {
        $('#note-count').textContent = note.value.length;
    });

    const messageInput = $('#message-input');
    messageInput.addEventListener('input', updateMessageUI);
    $('#message-confirm').addEventListener('click', () => commitAdd(messageInput.value.trim()));
    $('#message-skip').addEventListener('click', () => commitAdd(''));
    $('#message-modal').addEventListener('click', (e) => {
        if (e.target.id === 'message-modal') closeMessageModal();
    });

    $$('[data-close]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.dataset.close).hidden = true;
            if (btn.dataset.close === 'checkout-modal' || btn.dataset.close === 'success-modal') {
                document.body.style.overflow = '';
            }
        });
    });

    $('#open-search').addEventListener('click', openSearch);
    $('#close-search').addEventListener('click', closeSearch);
    $('#search-bar-input').addEventListener('input', (e) => setSearch(e.target.value));
    $('#product-search').addEventListener('input', (e) => setSearch(e.target.value));
    $('#clear-filters').addEventListener('click', () => {
        state.activeCategory = 'all';
        state.search = '';
        $('#product-search').value = '';
        $('#search-bar-input').value = '';
        renderCategories();
        renderProducts();
    });

    const menuToggle = $('#menu-toggle');
    const nav = $('#main-nav');
    menuToggle.addEventListener('click', () => {
        const open = nav.classList.toggle('open');
        menuToggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            nav.classList.remove('open');
            menuToggle.setAttribute('aria-expanded', 'false');
        }
    });

    $('#hero-prev').addEventListener('click', () => { goToSlide(state.heroIndex - 1); startHero(); });
    $('#hero-next').addEventListener('click', () => { goToSlide(state.heroIndex + 1); startHero(); });
    startHero();

    window.addEventListener('scroll', () => {
        $('#site-header').classList.toggle('scrolled', window.scrollY > 12);
    }, { passive: true });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeCart();
        closeSearch();
        ['message-modal', 'checkout-modal', 'success-modal'].forEach((id) => {
            const el = document.getElementById(id);
            if (el && !el.hidden) {
                el.hidden = true;
                document.body.style.overflow = '';
            }
        });
    });

    loadCatalog()
        .then(() => $('#loading').classList.add('hide'))
        .catch((err) => {
            $('#loading').classList.add('hide');
            const grid = $('#product-grid');
            if (grid) {
                grid.innerHTML = `<div class="shop-empty" style="grid-column:1/-1">
                    <h3>We could not load the counter</h3>
                    <p>${escapeHtml(err.message)}</p>
                    <button class="btn btn-clay" onclick="location.reload()">Try again</button>
                </div>`;
            }
        });
}

document.addEventListener('DOMContentLoaded', init);
