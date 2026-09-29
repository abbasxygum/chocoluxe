const express = require('express');
const { get, all, run } = require('./db');
const { authMiddleware, adminMiddleware, optionalAuth } = require('./middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const { category, active } = req.query;
  
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  
  if (active !== undefined) {
    sql += ' AND is_active = ?';
    params.push(active === 'true' ? 1 : 0);
  } else {
    sql += ' AND is_active = 1';
  }
  
  sql += ' ORDER BY category, name';
  
  const products = all(sql, params);
  
  const formattedProducts = products.map(p => ({
    ...p,
    sizes: JSON.parse(p.sizes),
    images: JSON.parse(p.images || '[]')
  }));
  
  res.json({ products: formattedProducts });
});

router.get('/categories', (req, res) => {
  const categories = all('SELECT DISTINCT category FROM products WHERE is_active = 1');
  res.json({ categories: categories.map(c => c.category) });
});

router.get('/:id', optionalAuth, (req, res) => {
  const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  
  res.json({
    product: {
      ...product,
      sizes: JSON.parse(product.sizes),
      images: JSON.parse(product.images || '[]')
    }
  });
});

router.post('/', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, description, base_price, sizes, images, category, is_active, stock_quantity } = req.body;
    
    if (!name || !base_price || !sizes) {
      return res.status(400).json({ error: 'Name, base price, and sizes are required' });
    }
    
    const result = run(
      `INSERT INTO products (name, description, base_price, sizes, images, category, is_active, stock_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || '',
        base_price,
        JSON.stringify(sizes),
        JSON.stringify(images || []),
        category || 'regular',
        is_active !== false ? 1 : 0,
        stock_quantity || 0
      ]
    );
    
    const product = get('SELECT * FROM products WHERE id = ?', [result.lastID]);
    
    res.status(201).json({
      message: 'Product created',
      product: {
        ...product,
        sizes: JSON.parse(product.sizes),
        images: JSON.parse(product.images || '[]')
      }
    });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, description, base_price, sizes, images, category, is_active, stock_quantity } = req.body;
    
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    run(
      `UPDATE products SET 
        name = ?, description = ?, base_price = ?, sizes = ?, images = ?, 
        category = ?, is_active = ?, stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || product.name,
        description !== undefined ? description : product.description,
        base_price || product.base_price,
        sizes ? JSON.stringify(sizes) : product.sizes,
        images ? JSON.stringify(images) : product.images,
        category || product.category,
        is_active !== undefined ? (is_active ? 1 : 0) : product.is_active,
        stock_quantity !== undefined ? stock_quantity : product.stock_quantity,
        req.params.id
      ]
    );
    
    const updatedProduct = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    
    res.json({
      message: 'Product updated',
      product: {
        ...updatedProduct,
        sizes: JSON.parse(updatedProduct.sizes),
        images: JSON.parse(updatedProduct.images || '[]')
      }
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
    
    run('DELETE FROM products WHERE id = ?', [req.params.id]);
    
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;