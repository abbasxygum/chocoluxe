/* ============================================================
   Chocoluxe by Iram — Admin Order Manager
   ============================================================ */
(function () {
    'use strict';

    var API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? window.location.origin + '/api' : '/api';
    var TOKEN_KEY = 'chx_admin_token';
    var USER_KEY = 'chx_admin_user';

    var state = {
        orders: [],
        page: 1,
        perPage: 12,
        totalPages: 1,
        status: '',
        payment: '',
        search: '',
        loading: false,
        products: [],
        categories: [],
        productFilter: { category: '', search: '', stock: '' }
    };

    var $ = function (sel) { return document.querySelector(sel); };
    var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

    /* ---------- helpers ---------- */
    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function money(n) {
        return '₹' + Math.round(n).toLocaleString('en-IN');
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(msg, isError) {
        var t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        if (isError) t.classList.add('error'); else t.classList.remove('error');
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { t.classList.remove('show'); }, 2800);
    }

    async function api(path, opts) {
        opts = opts || {};
        var headers = { 'Content-Type': 'application/json' };
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        var res = await fetch(API + path, { headers: headers, ...opts });
        var data = await res.json().catch(function () { return {}; });
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            showLoginGate();
            throw new Error('Session expired. Please sign in again.');
        }
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    function queryString() {
        var p = new URLSearchParams();
        p.set('page', state.page);
        p.set('limit', state.perPage);
        if (state.status) p.set('status', state.status);
        if (state.payment) p.set('paymentStatus', state.payment);
        if (state.search) p.set('search', state.search);
        return p.toString();
    }

    function fmtDate(d) {
        if (!d) return '-';
        var dt = new Date(String(d).replace(' ', 'T'));
        if (isNaN(dt)) return d;
        return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
            dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }

    function statusBadge(s) {
        return '<span class="badge ' + esc(s || 'pending') + '">' + esc((s || 'pending')) + '</span>';
    }

    function paymentBadge(p) {
        var method = p && p.payment_method ? p.payment_method : '';
        var out = p && p.payment_status ? '<span class="badge ' + esc(p.payment_status) + '">' + esc(p.payment_status) + '</span>' : '';
        if (method) out += ' <span class="badge ' + esc(method) + '">' + esc(method) + '</span>';
        return out;
    }

    /* ---------- login gate ---------- */
    function showLoginGate() {
        $('#dashboard').hidden = true;
        $('#login-gate').hidden = false;
    }

    function showDashboard() {
        $('#login-gate').hidden = true;
        $('#dashboard').hidden = false;
    }

    async function init() {
        if (!getToken()) {
            showLoginGate();
            return;
        }
        try {
            var me = await api('/auth/me');
            if (!me.user || me.user.role !== 'admin') throw new Error('Not admin');
            $('#admin-user-name').textContent = me.user.name;
            showDashboard();
            bindEvents();
            switchPage('overview');
            await refreshAll();
        } catch (e) {
            showLoginGate();
        }
    }

    /* ---------- navigation ---------- */
    function bindEvents() {
        $$('.nav-item').forEach(function (item) {
            item.addEventListener('click', function (ev) {
                ev.preventDefault();
                switchPage(item.dataset.page);
            });
        });

        $$('[data-goto]').forEach(function (el) {
            el.addEventListener('click', function (ev) {
                ev.preventDefault();
                switchPage(el.dataset.goto);
            });
        });

        $('#sidebar-toggle').addEventListener('click', function () {
            $('#sidebar').classList.toggle('open');
        });

        $('#logout-btn').addEventListener('click', function () {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            window.location.href = 'admin-login.html';
        });

        $('#refresh-btn').addEventListener('click', refreshAll);
        $('#order-search').addEventListener('input', debounce(function () {
            state.search = $('#order-search').value.trim();
            state.page = 1;
            loadOrders();
        }, 350));

        $('#order-status-filter').addEventListener('change', function () {
            state.status = this.value;
            state.page = 1;
            loadOrders();
        });

        $('#payment-filter').addEventListener('change', function () {
            state.payment = this.value;
            state.page = 1;
            loadOrders();
        });

        $('#submit-status').addEventListener('click', submitStatus);

        $('#product-search').addEventListener('input', debounce(function () {
            state.productFilter.search = this.value.trim();
            renderProducts();
        }, 250));

        $('#product-category-filter').addEventListener('change', function () {
            state.productFilter.category = this.value;
            renderProducts();
        });

        $('#product-stock-filter').addEventListener('change', function () {
            state.productFilter.stock = this.value;
            renderProducts();
        });

        $('#new-product-btn').addEventListener('click', function () {
            openProductModal(null);
        });

        $('#product-form').addEventListener('submit', saveProduct);
        $('#delete-product').addEventListener('click', removeProduct);
        $('#load-photo-library').addEventListener('click', togglePhotoLibrary);
        $('#p-images').addEventListener('input', updatePreview);
    }

    function debounce(fn, ms) {
        var t;
        return function () {
            clearTimeout(t);
            t = setTimeout(fn, ms);
        };
    }

    function switchPage(page) {
        $$('.page').forEach(function (p) { p.classList.remove('active'); });
        $$('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.page === page); });
        $('#page-' + page).classList.add('active');
        if (page === 'orders') loadOrders();
        if (page === 'messages') loadMessages();
        if (page === 'products') loadProducts();
    }

    /* ---------- loads ---------- */
    async function refreshAll() {
        await Promise.all([loadDashboard(), loadOrders(), loadMessages(), refreshPendingCount()]);
    }

    async function refreshPendingCount() {
        try {
            var d = await api('/admin/dashboard');
            var n = d.stats.pendingOrders || 0;
            var el = $('#pending-count');
            el.hidden = !n;
            el.textContent = n;
        } catch (e) { /* ignore */ }
    }

    async function loadDashboard() {
        try {
            var d = await api('/admin/dashboard');
            var s = d.stats;
            renderStats(s);
            renderRecentOrders(d.recentOrders);
            renderStatusChips(d.stats, d.recentOrders);
            $('#overview-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            toast(e.message, true);
        }
    }

    function renderStats(s) {
        var cards = [
            { label: 'Total revenue', value: money(s.totalRevenue), cls: 'good' },
            { label: 'Total orders', value: s.totalOrders, cls: '' },
            { label: 'Pending', value: s.pendingOrders, cls: 'warn' },
            { label: 'Processing', value: s.processingOrders, cls: '' },
            { label: 'Shipped', value: s.shippedOrders, cls: '' },
            { label: 'Delivered', value: s.deliveredOrders, cls: 'good' },
            { label: 'Cancelled / Rejected', value: s.cancelledOrders, cls: 'warn' }
        ];
        $('#stats-grid').innerHTML = cards.map(function (c) {
            return '<div class="stat-card ' + c.cls + '"><div class="stat-label">' + c.label +
                '</div><div class="stat-value">' + c.value + '</div></div>';
        }).join('');
    }

    function renderRecentOrders(orders) {
        var body = $('#recent-orders-body');
        if (!orders || !orders.length) {
            body.innerHTML = '<tr class="empty-row"><td colspan="7">No orders yet</td></tr>';
            return;
        }
        body.innerHTML = orders.map(orderRow).join('');
        bindOrderRowActions(body);
    }

    function orderRow(o) {
        return '<tr>' +
            '<td class="mono">' + esc(o.order_id) + '</td>' +
            '<td><div class="cell-main">' + esc(o.customer_name) + '</div><div class="cell-sub">' + esc(o.customer_phone) + '</div></td>' +
            '<td>' + money(o.total_amount) + '</td>' +
            '<td>' + paymentBadge(o) + '</td>' +
            '<td>' + statusBadge(o.order_status) + '</td>' +
            '<td class="cell-sub">' + fmtDate(o.created_at) + '</td>' +
            '<td><button class="link-btn" data-view="' + esc(o.order_id) + '">View</button></td>' +
            '</tr>';
    }

    function renderStatusChips(stats) {
        var orderCounts = [
            ['Pending', stats.pendingOrders],
            ['Confirmed', stats.confirmedOrders],
            ['Processing', stats.processingOrders],
            ['Shipped', stats.shippedOrders],
            ['Delivered', stats.deliveredOrders]
        ];
        $('#status-chips').innerHTML = orderCounts
            .filter(function (c) { return c[1] > 0; })
            .map(function (c) { return '<div class="chip"><b>' + c[1] + '</b>' + c[0] + '</div>'; }).join('')
            || '<span class="muted">No orders yet</span>';
    }

    /* ---------- orders page ---------- */
    async function loadOrders() {
        if (state.loading) return;
        state.loading = true;
        try {
            var data = await api('/admin/orders?' + queryString());
            state.orders = data.orders || [];
            state.totalPages = data.pagination ? data.pagination.pages : 1;
            renderOrders();
            renderPagination();
        } catch (e) {
            toast(e.message, true);
        } finally {
            state.loading = false;
        }
    }

    function renderOrders() {
        var body = $('#orders-body');
        if (!state.orders.length) {
            body.innerHTML = '<tr class="empty-row"><td colspan="7">No orders match your filters</td></tr>';
            return;
        }
        body.innerHTML = state.orders.map(orderRow).join('');
        bindOrderRowActions(body);
    }

    function bindOrderRowActions(container) {
        container.querySelectorAll('[data-view]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openOrderDetail(btn.dataset.view);
            });
        });
    }

    function renderPagination() {
        var wrap = $('#orders-pagination');
        if (state.totalPages <= 1) {
            wrap.innerHTML = '';
            return;
        }
        var html = '';
        html += '<button class="page-btn" data-pg="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>&#8592;</button>';
        for (var i = 1; i <= state.totalPages; i++) {
            html += '<button class="page-btn' + (i === state.page ? ' active' : '') + '" data-pg="' + i + '">' + i + '</button>';
        }
        html += '<button class="page-btn" data-pg="' + (state.page + 1) + '"' + (state.page >= state.totalPages ? ' disabled' : '') + '>&#8594;</button>';
        wrap.innerHTML = html;
        wrap.querySelectorAll('[data-pg]').forEach(function (b) {
            b.addEventListener('click', function () {
                if (b.disabled) return;
                state.page = parseInt(b.dataset.pg, 10);
                loadOrders();
            });
        });
    }

    /* ---------- order detail ---------- */
    var currentOrder = null;

    async function openOrderDetail(orderId) {
        try {
            var data = await api('/admin/orders/' + orderId);
            currentOrder = data.order;
            renderOrderModal(data.order, data.history);
            openModal('order-modal');
        } catch (e) {
            toast(e.message, true);
        }
    }

    function renderOrderModal(order, history) {
        $('#modal-order-id').textContent = order.order_id;

        var items = (order.items || []).map(function (i) {
            return '<div class="item-line">' +
                '<div><div class="cell-main">' + esc(i.name) + ' × ' + i.quantity + '</div>' +
                '<div class="meta">' + esc(i.size || 'Regular') + (i.message ? ' · Message:' : '') + '</div>' +
                (i.message ? '<div class="item-msg">"' + esc(i.message) + '"</div>' : '') +
                '</div><strong>' + money(i.price * i.quantity) + '</strong></div>';
        }).join('') || '<p class="muted">No items</p>';

        var historyHtml = (history && history.length
            ? history.map(function (h) {
                return '<div class="history-item">' +
                    '<div class="hs">' + esc(h.status) + '</div>' +
                    '<div class="hd">' + fmtDate(h.created_at) + (h.created_by_name ? ' · by ' + esc(h.created_by_name) : '') + '</div>' +
                    (h.note ? '<div class="hn">' + esc(h.note) + '</div>' : '') +
                    '</div>';
            }).join('')
            : '<p class="muted">No history</p>');

        $('#order-modal-body').innerHTML = `
            <div class="detail-grid">
                <div class="detail-box"><div class="k">Customer</div><div class="v">${esc(order.customer_name)}</div></div>
                <div class="detail-box"><div class="k">Phone</div><div class="v">${esc(order.customer_phone)}</div></div>
                <div class="detail-box"><div class="k">Email</div><div class="v">${esc(order.customer_email)}</div></div>
                <div class="detail-box"><div class="k">Status</div><div class="v">${statusBadge(order.order_status)}</div></div>
                <div class="detail-box"><div class="k">Payment</div><div class="v">${paymentBadge(order)}</div></div>
                <div class="detail-box"><div class="k">Total</div><div class="v">${money(order.total_amount)}</div></div>
                <div class="detail-box"><div class="k">Placed on</div><div class="v">${fmtDate(order.created_at)}</div></div>
            </div>

            <h4 class="card-label">Items</h4>
            ${items}
            <div class="total-row-line"><span>Subtotal ${money(order.subtotal)} · Delivery ${order.shipping_cost ? money(order.shipping_cost) : 'FREE'} · GST ${money(order.tax)}</span><strong>Total ${money(order.total_amount)}</strong></div>

            ${order.special_instructions ? `<div class="req-box"><div class="k">Gift message / delivery note from customer</div><div class="v">"${esc(order.special_instructions)}"</div></div>` : ''}

            <div class="history-timeline"><h4 class="card-label">Status history</h4>${historyHtml}</div>

            <div class="modal-actions">
                <button class="btn btn-ghost" data-status-open="${esc(order.order_id)}">Update Status</button>
                ${order.order_status === 'pending' ? `<button class="btn btn-gold" data-accept="${esc(order.order_id)}">Accept Order</button>
                <button class="btn btn-outline" data-reject="${esc(order.order_id)}">Reject</button>` : ''}
            </div>`;

        $('#order-modal-body').querySelector('[data-status-open]').addEventListener('click', function () {
            closeModal('order-modal');
            openStatusModal(this.dataset.statusOpen);
        });
        var acceptBtn = $('#order-modal-body').querySelector('[data-accept]');
        if (acceptBtn) acceptBtn.addEventListener('click', function () { acceptOrder(this.dataset.accept); });
        var rejectBtn = $('#order-modal-body').querySelector('[data-reject]');
        if (rejectBtn) rejectBtn.addEventListener('click', function () { rejectOrder(this.dataset.reject); });
    }

    async function acceptOrder(orderId) {
        try {
            await api('/admin/orders/' + orderId + '/accept', { method: 'PATCH' });
            toast('Order accepted');
            closeModal('order-modal');
            refreshAll();
        } catch (e) { toast(e.message, true); }
    }

    async function rejectOrder(orderId) {
        var reason = window.prompt('Reason for rejecting this order (optional):');
        if (reason === null) return;
        try {
            await api('/admin/orders/' + orderId + '/reject', {
                method: 'PATCH',
                body: JSON.stringify({ reason: reason || 'Order rejected by admin' })
            });
            toast('Order rejected');
            closeModal('order-modal');
            refreshAll();
        } catch (e) { toast(e.message, true); }
    }

    /* ---------- status modal ---------- */
    function openStatusModal(orderId) {
        $('#status-order-id').value = orderId;
        $('#new-status').value = currentOrder && currentOrder.order_id === orderId ? currentOrder.order_status : 'pending';
        $('#status-note').value = '';
        openModal('status-modal');
    }

    async function submitStatus() {
        var orderId = $('#status-order-id').value;
        var status = $('#new-status').value;
        var note = $('#status-note').value.trim();
        try {
            await api('/admin/orders/' + orderId + '/status', {
                method: 'PATCH',
                body: JSON.stringify({ status: status, note: note || undefined })
            });
            toast('Status updated to ' + status);
            closeModal('status-modal');
            await refreshAll();
            if (currentOrder && currentOrder.order_id === orderId) {
                openOrderDetail(orderId);
            }
        } catch (e) { toast(e.message, true); }
    }

    /* ---------- messages page ---------- */
    async function loadMessages() {
        try {
            var data = await api('/admin/messages');
            renderMessages(data.messages || []);
        } catch (e) {
            toast(e.message, true);
        }
    }

    function renderMessages(messages) {
        var board = $('#messages-board');
        if (!messages.length) {
            board.innerHTML = '';
            return;
        }
        board.innerHTML = messages.map(function (m) {
            var typeLabel = m.type === 'item' ? 'On item' : 'Order note';
            var typeCls = m.type === 'item' ? 'item' : 'note';
            var ctx = m.type === 'item'
                ? esc(m.product) + (m.quantity ? ' × ' + m.quantity : '')
                : 'Left at checkout';
            return '<div class="msg-card">' +
                '<div>' +
                '<div class="msg-head">' +
                '<span class="mono">' + esc(m.orderId) + '</span>' +
                '<span class="msg-type ' + typeCls + '">' + typeLabel + '</span>' +
                '<span class="msg-ctx">' + ctx + '</span>' +
                '</div>' +
                '<div class="msg-text">"' + esc(m.message) + '"</div>' +
                '</div>' +
                '<div class="msg-user"><span>' + esc(m.customerName) + '</span>' +
                '<small>' + esc(m.customerPhone) + '</small>' +
                '<small>' + fmtDate(m.createdAt) + '</small>' +
                '<button class="link-btn" data-msg-order="' + esc(m.orderId) + '">View order</button>' +
                '</div>' +
                '</div>';
        }).join('');

        board.querySelectorAll('[data-msg-order]').forEach(function (b) {
            b.addEventListener('click', function () { openOrderDetail(this.dataset.msgOrder); });
        });
    }

    /* ============================================================
       Products
       ============================================================ */

    async function loadProducts() {
        try {
            var [p, c] = await Promise.all([
                api('/products?active=all'),
                api('/products/categories')
            ]);
            state.products = p.products || [];
            state.categories = c.categories || [];
            fillCategorySelects();
            renderProducts();
        } catch (e) {
            toast(e.message || 'Could not load products', true);
        }
    }

    function fillCategorySelects() {
        var filter = $('#product-category-filter');
        var editor = $('#p-category');
        var currentFilter = filter.value;
        var currentEditor = editor.value;

        var options = state.categories.map(function (c) {
            return '<option value="' + esc(c.slug) + '">' + esc(c.label) + '</option>';
        }).join('');

        filter.innerHTML = '<option value="">All categories</option>' + options;
        filter.value = currentFilter;

        editor.innerHTML = options || '<option value="">No categories yet</option>';
        editor.value = currentEditor;
    }

    function filteredProducts() {
        var f = state.productFilter;
        var term = f.search.toLowerCase();

        return state.products.filter(function (p) {
            if (f.category && p.category !== f.category) return false;
            if (f.stock === 'in' && Number(p.stock_quantity) <= 0) return false;
            if (f.stock === 'out' && Number(p.stock_quantity) > 0) return false;
            if (term) {
                var hay = [p.name, p.tagline, p.description].join(' ').toLowerCase();
                if (hay.indexOf(term) === -1) return false;
            }
            return true;
        });
    }

    function categoryLabel(slug) {
        var found = state.categories.filter(function (c) { return c.slug === slug; })[0];
        return found ? found.label : slug;
    }

    function productThumb(p) {
        var img = (p.images || []).filter(Boolean)[0];
        if (img) {
            return '<img class="p-thumb" src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">';
        }
        var icon = (state.categories.filter(function (c) { return c.slug === p.category; })[0] || {}).icon || '🍫';
        return '<div class="p-thumb placeholder" aria-hidden="true">' + icon + '</div>';
    }

    function renderProducts() {
        var grid = $('#admin-product-grid');
        var list = filteredProducts();
        var active = state.products.filter(function (p) { return p.is_active; }).length;

        $('#products-count').textContent = state.products.length
            ? list.length + ' of ' + state.products.length + ' shown · ' + active + ' live on the storefront'
            : 'No products yet.';

        if (!list.length) {
            grid.innerHTML = '<div class="card"><p class="muted" style="margin:0">Nothing matches those filters.</p></div>';
            return;
        }

        grid.innerHTML = list.map(function (p) {
            var prices = Object.keys(p.sizes || {}).map(function (k) { return p.sizes[k]; });
            var min = prices.length ? Math.min.apply(null, prices) : 0;
            var max = prices.length ? Math.max.apply(null, prices) : 0;
            var out = Number(p.stock_quantity) <= 0;

            return '<article class="p-card' + (p.is_active ? '' : ' hidden-product') + '" data-product-id="' + p.id + '">' +
                '<div class="p-card-media">' + productThumb(p) +
                    (p.is_active ? '' : '<span class="p-flag hidden-flag">Hidden</span>') +
                    (out && p.is_active ? '<span class="p-flag out-flag">Sold out</span>' : '') +
                '</div>' +
                '<div class="p-card-body">' +
                    '<p class="p-card-cat">' + esc(categoryLabel(p.category)) +
                        (p.is_featured ? ' <span class="p-star">Featured</span>' : '') + '</p>' +
                    '<h3 class="p-card-name">' + esc(p.name) + '</h3>' +
                    (p.badge ? '<span class="p-badge">' + esc(p.badge) + '</span>' : '') +
                    '<p class="p-card-price">' + money(min) +
                        (min !== max ? ' <span>&ndash;</span> ' + money(max) : '') + '</p>' +
                    '<p class="p-card-meta">' + Object.keys(p.sizes || {}).length + ' size(s) · ' +
                        (out ? 'out of stock' : p.stock_quantity + ' in stock') +
                        (Number(p.rating_count) > 0 ? ' · ★ ' + Number(p.rating).toFixed(1) : '') + '</p>' +
                    '<div class="p-card-actions">' +
                        '<button class="btn btn-ghost btn-sm" data-edit-product="' + p.id + '">Edit</button>' +
                    '</div>' +
                '</div>' +
            '</article>';
        }).join('');

        grid.querySelectorAll('[data-edit-product]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.products.filter(function (x) { return x.id === Number(btn.dataset.editProduct); })[0];
                if (p) openProductModal(p);
            });
        });
    }

    function sizesToText(sizes) {
        return Object.keys(sizes || {}).map(function (k) { return k + ' = ' + sizes[k]; }).join('\n');
    }

    function textToSizes(text) {
        var out = {};
        text.split('\n').forEach(function (line) {
            var bits = line.split('=');
            if (bits.length < 2) return;
            var label = bits[0].trim();
            var price = Math.round(Number(bits[1].trim()));
            if (label && isFinite(price) && price >= 0) out[label] = price;
        });
        return out;
    }

    function openProductModal(product) {
        $('#product-form').reset();
        $('#product-preview').innerHTML = '';
        $('#photo-library').hidden = true;
        $('#photo-library').innerHTML = '';

        $('#product-id').value = product ? product.id : '';
        $('#product-modal-title').textContent = product ? 'Edit ' + product.name : 'New product';
        $('#delete-product').hidden = !product;
        $('#p-active').checked = product ? !!product.is_active : true;
        $('#p-featured').checked = product ? !!product.is_featured : false;

        if (product) {
            $('#p-name').value = product.name || '';
            $('#p-category').value = product.category;
            $('#p-tagline').value = product.tagline || '';
            $('#p-description').value = product.description || '';
            $('#p-badge').value = product.badge || '';
            $('#p-stock').value = product.stock_quantity;
            $('#p-rating').value = product.rating == null ? 4.6 : product.rating;
            $('#p-rating-count').value = product.rating_count || 0;
            $('#p-sizes').value = sizesToText(product.sizes);
            $('#p-images').value = (product.images || []).join('\n');
        } else {
            $('#p-stock').value = 20;
            $('#p-rating').value = 4.6;
            $('#p-rating-count').value = 0;
            $('#p-sizes').value = '50g bar = 120\nPack of 3 = 340';
        }

        updatePreview();
        openModal('product-modal');
    }

    function updatePreview() {
        var images = ($('#p-images').value || '').split('\n')
            .map(function (s) { return s.trim(); }).filter(Boolean);

        $('#product-preview').innerHTML = images.length
            ? images.map(function (src) {
                return '<img class="p-preview-img" src="' + esc(src) + '" alt="" onerror="this.remove()">';
            }).join('')
            : '<span class="muted">No photo yet &mdash; the storefront will show a placeholder tile.</span>';
    }

    async function togglePhotoLibrary() {
        var lib = $('#photo-library');
        if (!lib.hidden) {
            lib.hidden = true;
            return;
        }

        try {
            var res = await api('/products/library');
            lib.innerHTML = res.images.length
                ? res.images.map(function (src) {
                    var name = src.split('/').pop();
                    return '<button type="button" class="photo-thumb" data-pick="' + esc(src) + '">' +
                        '<img src="' + esc(src) + '" alt="" loading="lazy" onerror="this.remove()">' +
                        '<span>' + esc(name) + '</span></button>';
                }).join('')
                : '<span class="muted">No photos in Pictures/ yet.</span>';

            lib.hidden = false;

            lib.querySelectorAll('[data-pick]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var field = $('#p-images');
                    var current = field.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
                    if (current.indexOf(this.dataset.pick) === -1) current.push(this.dataset.pick);
                    field.value = current.join('\n');
                    updatePreview();
                });
            });
        } catch (e) {
            toast(e.message || 'Could not load photos', true);
        }
    }

    async function saveProduct(ev) {
        ev.preventDefault();

        var sizes = textToSizes($('#p-sizes').value);
        if (!Object.keys(sizes).length) {
            toast('Add at least one size like "50g bar = 120"', true);
            $('#p-sizes').focus();
            return;
        }

        var name = $('#p-name').value.trim();
        if (!name) {
            toast('Give the product a name', true);
            $('#p-name').focus();
            return;
        }

        var prices = Object.keys(sizes).map(function (k) { return sizes[k]; });
        var images = $('#p-images').value.split('\n')
            .map(function (s) { return s.trim(); }).filter(Boolean);

        var payload = {
            name: name,
            tagline: $('#p-tagline').value.trim(),
            description: $('#p-description').value.trim(),
            category: $('#p-category').value,
            badge: $('#p-badge').value.trim(),
            stock_quantity: Number($('#p-stock').value) || 0,
            rating: Number($('#p-rating').value) || 0,
            rating_count: Number($('#p-rating-count').value) || 0,
            is_active: $('#p-active').checked,
            is_featured: $('#p-featured').checked,
            base_price: Math.min.apply(null, prices),
            sizes: sizes,
            images: images
        };

        var id = $('#product-id').value;
        var btn = $('#save-product');
        btn.disabled = true;

        try {
            if (id) {
                await api('/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
                toast('Product updated');
            } else {
                await api('/products', { method: 'POST', body: JSON.stringify(payload) });
                toast('Product created');
            }
            closeModal('product-modal');
            await loadProducts();
        } catch (e) {
            toast(e.message || 'Could not save the product', true);
        } finally {
            btn.disabled = false;
        }
    }

    async function removeProduct() {
        var id = $('#product-id').value;
        if (!id) return;

        var product = state.products.filter(function (p) { return p.id === Number(id); })[0];
        if (!confirm('Remove "' + product.name + '" from the storefront?\n\nPast orders keep their history either way.')) return;

        try {
            var res = await api('/products/' + id, { method: 'DELETE' });
            toast(res.message || 'Product removed');
            closeModal('product-modal');
            await loadProducts();
        } catch (e) {
            toast(e.message || 'Could not remove the product', true);
        }
    }

    /* ---------- modal helpers ---------- */
    function openModal(id) {
        var m = document.getElementById(id);
        m.hidden = false;
        requestAnimationFrame(function () { m.classList.add('open'); });
    }

    function closeModal(id) {
        var m = document.getElementById(id);
        m.classList.remove('open');
        setTimeout(function () { m.hidden = true; }, 240);
    }

    $$('.modal-backdrop [data-close]').forEach(function (b) {
        b.addEventListener('click', function () { closeModal(b.dataset.close); });
    });

    /* ---------- boot ---------- */
    init();
})();