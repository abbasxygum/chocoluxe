const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get } = require('../db');
const { generateToken, authMiddleware, optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone, address, city, pincode } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    const result = run(
      `INSERT INTO users (email, password_hash, name, phone, address, city, pincode, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'customer')`,
      [email, passwordHash, name, phone || '', address || '', city || '', pincode || '']
    );
    
    const user = get('SELECT id, email, name, role, phone, address, city, pincode, created_at FROM users WHERE id = ?', [result.lastID]);
    
    const token = generateToken(user);
    
    res.status(201).json({
      message: 'Registration successful',
      user,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = generateToken(user);
    
    const { password_hash, ...userWithoutPassword } = user;
    
    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = generateToken(user);
    
    const { password_hash, ...userWithoutPassword } = user;
    
    res.json({
      message: 'Admin login successful',
      user: userWithoutPassword,
      token
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Admin login failed' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const user = get('SELECT id, email, name, role, phone, address, city, pincode, created_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, city, pincode, currentPassword, newPassword } = req.body;
    
    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    
    if (currentPassword && newPassword) {
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      
      const passwordHash = await bcrypt.hash(newPassword, 12);
      run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
    }
    
    run(
      `UPDATE users SET name = ?, phone = ?, address = ?, city = ?, pincode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name || user.name, phone || user.phone, address || user.address, city || user.city, pincode || user.pincode, req.user.id]
    );
    
    const updatedUser = get('SELECT id, email, name, role, phone, address, city, pincode, created_at FROM users WHERE id = ?', [req.user.id]);
    
    res.json({ message: 'Profile updated', user: updatedUser });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

router.get('/verify', optionalAuth, (req, res) => {
  if (req.user) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;