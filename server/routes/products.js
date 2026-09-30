const express = require('express');
const fs = require('fs');
const path = require('path');
const { get, all, run } = require('../db');
const { authMiddleware, adminMiddleware, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_NAME = 120;
const MAX_TAGLINE = 160;
const MAX_DESCRIPTION = 1200;
const MAX_PRICE = 1000000;
const MAX_STOCK = 100000;
const MAX_IMAGES = 6;

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// Keep only paths that stay inside the project — no absolute paths, no "..".
const sanitizeImages = (images) => {
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => typeof img === 'string' && img.trim())
    .map((img) => img.trim().replace(/^\/+/, ''))
    .filter((img) => !img.includes('..') && !/^[a-z]+:/i.test(img))
    .slice(0, MAX_IMAGES);
};

const parseSizes = (sizes) => {
  if (typeof sizes === 'string') {
    try {
      sizes = JSON.parse(sizes);
    } catch {
      return null;
    }
  }
  if (!sizes || typeof sizes !== 'object' || Array.isArray(sizes)) return null;

  const entries = Object.entries(sizes)
    .map(([label, price]) => [String(label).trim().slice(0, 40), Math.round(Number(price))])
    .filter(([label, price]) => label && Number.isFinite(price) && price >= 0 && price <= MAX_PRICE);

  if (!entries.length) return null;
  return Object.fromEntries(entries);
};

const format = (p) => ({
  ...p,
  is_active: Boolean(p.is_active),
  is_featured: Boolean(p.is_featured),
  sizes: typeof p.sizes === 'string' ? JSON.parse(p.sizes) : p.sizes,
  images: typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || [])
});

// Lists the files already in Pictures/ so the admin can attach a photo by name
// instead of guessing at a path.
router.get('/library', authMiddleware, adminMiddleware, (req, res) => {
  const root = path.join(__dirname, '..', '..');
  const dir = path.join(root, 'Pictures');
  const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

  let files = [];
  try {
    files = fs.readdirSync(dir)
      .filter((f) => IMAGE_RE.test(f) && !/^android-chrome|apple-touch-icon|favicon/i.test(f))
      .sort()
      .map((f) => `Pictures/${f}`);
  } catch {
    files = [];
  }

  res.json({ images: files, directory: 'Pictures/' });
});

router.get('/categories', (req, res) => {
  const categories = all(`
    SELECT c.slug, c.label, c.tagline, c.icon, c.sort_order,
           (SELECT COUNT(*) FROM products p WHERE p.category = c.slug AND p.is_active = 1) AS product_count
    FROM categories c
    WHERE c.is_active = 1
    ORDER BY c.sort_order, c.label
  `);

  // Categories still in use by products but missing from the categories table.
  const orphans = all(`
    SELECT DISTINCT p.category AS slug, COUNT(*) AS product_count
    FROM products p
    WHERE p.is_active = 1
      AND p.category NOT IN (SELECT slug FROM categories WHERE is_active = 1)
    GROUP BY p.category
  `).map((o) => ({
    slug: o.slug,
    label: o.slug ? o.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Uncategorised',
    tagline: '',
    icon: '',
    sort_order: 999,
    product_count: o.product_count
  }));

  res.json({ categories: [...categories, ...orphans] });
});

router.post('/categories', authMiddleware, adminMiddleware, (req, res) => {
  const label = String(req.body?.label || '').trim().slice(0, 60);
  if (!label) return res.status(400).json({ error: 'Category label is required' });

  const slug = slugify(req.body?.slug || label);
  if (!slug) return res.status(400).json({ error: 'Could not build a slug from that label' });
  if (get('SELECT slug FROM categories WHERE slug = ?', [slug])) {
    return res.status(409).json({ error: 'That category already exists' });
  }

  const next = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories').n;

  run(
    'INSERT INTO categories (slug, label, tagline, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
    [
      slug,
      label,
      String(req.body?.tagline || '').trim().slice(0, 160),
      String(req.body?.icon || '').slice(0, 8),
      next
    ]
  );

  res.status(201).json({ message: 'Category created', slug });
});

router.get('/', optionalAuth, (req, res) => {
  const { category, active, search } = req.query;

  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ? OR tagline LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  // active=true (default) -> only live products, active=false -> only hidden,
  // active=all -> both.
  if (active !== undefined && active !== 'all') {
    sql += ' AND is_active = ?';
    params.push(active === 'true' ? 1 : 0);
  } else if (active === undefined) {
    sql += ' AND is_active = 1';
  }

  sql += ` ORDER BY
    CASE COALESCE((SELECT sort_order FROM categories c WHERE c.slug = products.category), 999)
    WHEN 0 THEN 999 ELSE 0 END,
    COALESCE((SELECT sort_order FROM categories c WHERE c.slug = products.category), 999),
    is_featured DESC,
    name`;

  res.json({ products: all(sql, params).map(format) });
});

router.get('/:id', optionalAuth, (req, res) => {
  const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json({ product: format(product) });
});

router.post('/', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, tagline, description, base_price, sizes, images, category, is_active, stock_quantity, badge, rating, rating_count, is_featured } = req.body;

    const cleanName = String(name || '').trim().slice(0, MAX_NAME);
    if (!cleanName) return res.status(400).json({ error: 'Product name is required' });

    const cleanSizes = parseSizes(sizes);
    if (!cleanSizes) {
      return res.status(400).json({ error: 'Add at least one size with a valid price' });
    }

    const prices = Object.values(cleanSizes);
    const base = Math.round(Number(base_price)) || Math.min(...prices);

    const result = run(
      `INSERT INTO products (
         name, tagline, description, base_price, sizes, images, category,
         is_active, stock_quantity, badge, rating, rating_count, is_featured
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanName,
        String(tagline || '').trim().slice(0, MAX_TAGLINE),
        String(description || '').trim().slice(0, MAX_DESCRIPTION),
        base,
        JSON.stringify(cleanSizes),
        JSON.stringify(sanitizeImages(images)),
        slugify(category) || 'gift-boxes',
        is_active !== false ? 1 : 0,
        Math.max(0, Math.min(MAX_STOCK, Math.round(Number(stock_quantity) || 0))),
        String(badge || '').trim().slice(0, 30) || null,
        Math.max(0, Math.min(5, Number(rating) || 4.6)),
        Math.max(0, Math.round(Number(rating_count) || 0)),
        is_featured ? 1 : 0
      ]
    );

    res.status(201).json({
      message: 'Product created',
      product: format(get('SELECT * FROM products WHERE id = ?', [result.lastID]))
    });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, tagline, description, base_price, sizes, images, category, is_active, stock_quantity, badge, rating, rating_count, is_featured } = req.body;

    const existing = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const cleanSizes = sizes === undefined ? null : parseSizes(sizes);
    if (sizes !== undefined && !cleanSizes) {
      return res.status(400).json({ error: 'Add at least one size with a valid price' });
    }

    const nextSizes = cleanSizes || JSON.parse(existing.sizes);
    const base = base_price === undefined
      ? existing.base_price
      : (Math.round(Number(base_price)) || Math.min(...Object.values(nextSizes)));

    run(
      `UPDATE products SET
         name = ?, tagline = ?, description = ?, base_price = ?, sizes = ?, images = ?,
         category = ?, is_active = ?, stock_quantity = ?, badge = ?, rating = ?,
         rating_count = ?, is_featured = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        String(name || existing.name).trim().slice(0, MAX_NAME),
        tagline === undefined ? (existing.tagline || '') : String(tagline).trim().slice(0, MAX_TAGLINE),
        description === undefined ? (existing.description || '') : String(description).trim().slice(0, MAX_DESCRIPTION),
        base,
        JSON.stringify(nextSizes),
        images === undefined ? existing.images : JSON.stringify(sanitizeImages(images)),
        category === undefined ? existing.category : (slugify(category) || existing.category),
        is_active === undefined ? existing.is_active : (is_active ? 1 : 0),
        stock_quantity === undefined
          ? existing.stock_quantity
          : Math.max(0, Math.min(MAX_STOCK, Math.round(Number(stock_quantity) || 0))),
        badge === undefined ? existing.badge : (String(badge).trim().slice(0, 30) || null),
        rating === undefined ? existing.rating : Math.max(0, Math.min(5, Number(rating) || 4.6)),
        rating_count === undefined
          ? existing.rating_count
          : Math.max(0, Math.round(Number(rating_count) || 0)),
        is_featured === undefined ? existing.is_featured : (is_featured ? 1 : 0),
        req.params.id
      ]
    );

    res.json({
      message: 'Product updated',
      product: format(get('SELECT * FROM products WHERE id = ?', [req.params.id]))
    });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Past orders must keep their history, so hide the product instead of
    // deleting the row outright.
    run('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      req.params.id
    ]);

    res.json({
      message: `"${product.name}" is now hidden from the storefront`,
      product: format(get('SELECT * FROM products WHERE id = ?', [req.params.id]))
    });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Hard delete, for removing a product that was never ordered.
router.delete('/:id/permanent', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const inOrders = all('SELECT items FROM orders')
      .some((o) => o.items.includes(`"id":${req.params.id}`));

    if (inOrders) {
      return res.status(409).json({
        error: 'This product appears in past orders, so it cannot be deleted — hide it instead'
      });
    }

    const result = run('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Product not found' });

    res.json({ message: 'Product permanently deleted' });
  } catch (err) {
    console.error('Permanent delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
