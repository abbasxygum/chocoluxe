const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'chocoluxe.db');
const db = new Database(dbPath);

console.log('Initializing database...');

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    phone TEXT,
    address TEXT,
    city TEXT,
    pincode TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    base_price INTEGER NOT NULL,
    sizes TEXT NOT NULL,
    images TEXT,
    category TEXT DEFAULT 'regular',
    is_active BOOLEAN DEFAULT 1,
    stock_quantity INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    user_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    customer_city TEXT NOT NULL,
    customer_pincode TEXT NOT NULL,
    special_instructions TEXT,
    items TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    shipping_cost INTEGER DEFAULT 0,
    tax INTEGER DEFAULT 0,
    total_amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('online', 'cod')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected')),
    cashfree_order_id TEXT,
    cashfree_payment_id TEXT,
    cashfree_signature TEXT,
    payment_details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    shipped_at DATETIME,
    delivered_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS cashfree_webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    order_id TEXT,
    payment_id TEXT,
    payload TEXT NOT NULL,
    signature TEXT,
    processed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
  CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
`);

const adminPassword = bcrypt.hashSync('admin123', 10);
const customerPassword = bcrypt.hashSync('customer123', 10);

const insertAdmin = db.prepare(`
  INSERT OR IGNORE INTO users (email, password_hash, name, role, phone, address, city, pincode)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertAdmin.run('admin@chocoluxe.com', adminPassword, 'Admin User', 'admin', '9876543210', 'Chocoluxe HQ', 'Mumbai', '400001');

const insertCustomer = db.prepare(`
  INSERT OR IGNORE INTO users (email, password_hash, name, role, phone, address, city, pincode)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertCustomer.run('customer@test.com', customerPassword, 'Test Customer', 'customer', '9876543211', '123 Test Street', 'Delhi', '110001');

const insertProducts = db.prepare(`
  INSERT OR IGNORE INTO products (name, description, base_price, sizes, images, category, is_active, stock_quantity)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const products = [
  [
    'Floral Artisan Chocolates',
    'Exquisite handcrafted chocolates infused with natural floral essences. Each piece is a delicate masterpiece featuring rose, lavender, and jasmine notes.',
    499,
    JSON.stringify({ small: 499, medium: 749, large: 1380 }),
    JSON.stringify(['Pictures/83F17655-3427-4781-9564-94A5ED6C29C8.jpg']),
    'regular',
    1,
    50
  ],
  [
    'Dry Fruit Artisan Chocolates',
    'Premium dark chocolate packed with hand-selected almonds, cashews, pistachios, and raisins. A perfect blend of crunch and sweetness.',
    499,
    JSON.stringify({ small: 499, medium: 749, large: 1380 }),
    JSON.stringify(['Pictures/84B74416-EDF1-4056-973C-02667F74312B.jpg']),
    'regular',
    1,
    50
  ],
  [
    'Floral + Dry Fruit Artisan Chocolate',
    'The best of both worlds - floral notes meet premium dry fruits in this luxurious combination. A symphony of flavors in every bite.',
    499,
    JSON.stringify({ small: 499, medium: 749, large: 1380 }),
    JSON.stringify(['Pictures/8678FCA6-81D7-443F-BBD6-16A9BF6698CC.jpg']),
    'regular',
    1,
    40
  ],
  [
    'Mono Beauty of Pinata',
    'Limited edition single-origin dark chocolate with a surprise center. Each piece reveals a unique flavor journey.',
    499,
    JSON.stringify({ small: 499, medium: 749, large: 1380 }),
    JSON.stringify(['Pictures/single pinata.jpg']),
    'special',
    1,
    20
  ],
  [
    'Tetraluxe Truffles',
    'Four-layer truffle experience: dark chocolate ganache, caramel, hazelnut praline, and gold dust finish. Pure luxury.',
    499,
    JSON.stringify({ small: 499, medium: 749, large: 1380 }),
    JSON.stringify(['Pictures/9D8EFE05-2BBE-4260-A890-63E8A812FCD3.jpg']),
    'special',
    1,
    15
  ],
  [
    'Gold Dusted Truffles',
    'Hand-rolled truffles dusted with 24k edible gold. Velvety smooth ganache center with a touch of gold elegance.',
    499,
    JSON.stringify({ small: 499, medium: 749, large: 1380 }),
    JSON.stringify(['Pictures/IMG_0853.jpg']),
    'special',
    1,
    15
  ],
  [
    'Chocolate Trio Box',
    'Curated collection of our three signature flavors in one elegant box. Perfect for gifting or indulgence.',
    499,
    JSON.stringify({ small: 499, medium: 749, large: 1380 }),
    JSON.stringify(['Pictures/CA6F6DAD-209B-456E-9B2F-50E69C4BFBE2.jpg']),
    'special',
    1,
    25
  ]
];

products.forEach(p => insertProducts.run(...p));

console.log('Database initialized successfully!');
console.log('Admin login: admin@chocoluxe.com / admin123');
console.log('Customer login: customer@test.com / customer123');

db.close();