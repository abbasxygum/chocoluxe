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

  CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    tagline TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    base_price INTEGER NOT NULL,
    sizes TEXT NOT NULL,
    images TEXT,
    category TEXT DEFAULT 'gift-boxes',
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
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
`);

// ---- Idempotent migrations for databases created by older versions ----
const existingColumns = new Set(
  db.prepare('PRAGMA table_info(products)').all().map(c => c.name)
);

const newColumns = [
  ['tagline', "TEXT DEFAULT ''"],
  ['badge', "TEXT"],
  ['rating', 'REAL DEFAULT 4.6'],
  ['rating_count', 'INTEGER DEFAULT 0'],
  ['is_featured', 'BOOLEAN DEFAULT 0']
];

newColumns.forEach(([name, definition]) => {
  if (!existingColumns.has(name)) {
    db.exec(`ALTER TABLE products ADD COLUMN ${name} ${definition}`);
    console.log(`  migrated: products.${name}`);
  }
});

// Older catalogs used coarse categories. Move them into the new set so the
// storefront filters stay consistent for rows that already exist.
const categoryMoves = {
  'Mono Beauty of Pinata': 'seasonal',
  'Tetraluxe Truffles': 'bonbons',
  'Gold Dusted Truffles': 'bonbons',
  'Chocolate Trio Box': 'combos'
};

const moveCategory = db.prepare(
  'UPDATE products SET category = ? WHERE name = ? AND category IN (?, ?)'
);

Object.entries(categoryMoves).forEach(([name, slug]) => {
  moveCategory.run(slug, name, 'regular', 'special');
});

db.prepare("UPDATE products SET category = 'gift-boxes' WHERE category = 'regular'").run();

// ---- Users ----
const adminPassword = bcrypt.hashSync('admin123', 10);
const customerPassword = bcrypt.hashSync('customer123', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (email, password_hash, name, role, phone, address, city, pincode)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertUser.run('admin@chocoluxe.com', adminPassword, 'Admin User', 'admin', '9876543210', 'Chocoluxe HQ', 'Mumbai', '400001');
insertUser.run('customer@test.com', customerPassword, 'Test Customer', 'customer', '9876543211', '123 Test Street', 'Delhi', '110001');

// ---- Categories ----
const categories = [
  ['bars', 'Chocolate Bars', 'Thin, generous slabs for the in-between moments', '🍫', 1],
  ['bonbons', 'Truffles & Bonbons', 'Hand-rolled, one bite at a time', '🧁', 2],
  ['lollipops', 'Lollipops', 'Big smiles in swirls', '🍭', 3],
  ['bites', 'Bites & Bark', 'Crunchy, snappy, utterly moreish', '🥨', 4],
  ['fudge', 'Fudge & Brittle', 'Old-fashioned, spoon-soft', '🍮', 5],
  ['drinks', 'Hot Chocolate', 'The warmest cup in the house', '☕', 6],
  ['combos', 'Combo Packs', 'More chocolate, better value', '🎁', 7],
  ['gift-boxes', 'Gift Boxes', 'Tied, ribboned, ready to hand over', '🎀', 8],
  ['seasonal', 'Seasonal', 'Only here for a little while', '🍂', 9]
];

const insertCategory = db.prepare(`
  INSERT INTO categories (slug, label, tagline, icon, sort_order)
  SELECT ?, ?, ?, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = ?)
`);

categories.forEach(([slug, label, tagline, icon, sort]) => {
  insertCategory.run(slug, label, tagline, icon, sort, slug);
});

// ---- Products ----
// [name, tagline, description, base_price, sizes, images, category, stock, badge, rating, rating_count, featured]
//
// Products with an empty `images` list render an on-brand placeholder tile on the
// storefront. Drop a photo in Pictures/ and set the path in Admin > Products.
const products = [
  // --- Chocolate Bars ---
  ['Classic Milk Chocolate Bar', 'Creamy, 34% cocoa, nothing fussy',
    'The bar we grew up making. Warm milk chocolate, a pinch of sea salt, and a snap you can hear across the room. Made in small batches so it reaches you barely warm.',
    120, { '50g bar': 120, 'Pack of 3': 340 }, [], 'bars', 60, 'Everyday favourite', 4.7, 214, 1],

  ['Rich Dark 70% Bar', 'Single estate cocoa, gently bitter',
    'Serious, grown-up dark chocolate. Cacao from a single Indian estate, tempered slowly for a clean shine and a long, slightly fruity finish.',
    140, { '50g bar': 140, 'Pack of 3': 400 }, [], 'bars', 55, null, 4.8, 156, 0],

  ['Hazelnut Cocoa Bar', 'Roasted hazelnut, a little sea salt',
    'Dark chocolate shot through with whole roasted hazelnuts from the Kashmir valley. Break a square off and watch it shatter.',
    160, { '50g bar': 160, 'Pack of 3': 450 }, [], 'bars', 45, 'New', 4.6, 89, 0],

  ['Salted Caramel Bar', 'Burnt caramel ribbons through 60%',
    'Soft caramel ribbons running through milk chocolate, finished with flaky salt. Our counter regulars ask for this one by name.',
    150, { '50g bar': 150, 'Pack of 3': 420 }, [], 'bars', 40, 'Bestseller', 4.9, 302, 1],

  // --- Truffles & Bonbons ---
  ['Classic Truffle Box', 'Six ganache flavours, hand-rolled daily',
    'Our founding recipe. Six hand-rolled truffles in classic dark, milk, white, hazelnut, caramel and coffee, each with a soft ganache centre that melts almost on contact.',
    360, { 'Box of 6': 360, 'Box of 12': 680, 'Box of 24': 1290 }, [], 'bonbons', 50, 'Bestseller', 4.9, 431, 1],

  ['Velvet Ganache Truffles', 'Whipped cream ganache, feather-light',
    'Almost mousse-like in the middle. We whip the cream overnight so the ganache stays impossibly light, then roll every truffle by hand each morning.',
    400, { 'Box of 6': 400, 'Box of 12': 750 }, [], 'bonbons', 40, null, 4.7, 168, 0],

  ['Belgian Cocoa Truffles', 'Cocoa powder from Belgium, dusted by hand',
    'Rich, earthy, dusted with pure cocoa the moment before it leaves us. For people who like their chocolate to taste properly of chocolate.',
    480, { 'Box of 6': 480, 'Box of 12': 900 }, [], 'bonbons', 30, 'Premium', 4.8, 121, 0],

  ['Mint White Truffles', 'Garden mint, cool and clean',
    'White chocolate truffles with a whisper of garden mint. Cool rather than sharp, and our most requested seasonal box every summer.',
    380, { 'Box of 6': 380, 'Box of 12': 720 }, [], 'bonbons', 35, null, 4.5, 74, 0],

  ['Tetraluxe Truffles', 'Four layers, gold-dusted finish',
    'Four-layer truffle experience: dark chocolate ganache, caramel, hazelnut praline, and a gold dust finish. Pure luxury.',
    499, { small: 499, medium: 749, large: 1380 }, ['Pictures/9D8EFE05-2BBE-4260-A890-63E8A812FCD3.jpg'], 'bonbons', 15, 'Limited', 4.9, 256, 1],

  ['Gold Dusted Truffles', 'Velvety ganache, 24k edible gold',
    'Hand-rolled truffles dusted with edible gold. Velvety smooth ganache centre with a touch of gold elegance.',
    499, { small: 499, medium: 749, large: 1380 }, ['Pictures/IMG_0853.jpg'], 'bonbons', 15, null, 4.8, 198, 0],

  // --- Lollipops ---
  ['Classic Swirl Lollipop', 'The one every child asks for',
    'Hand-poured milk chocolate on a paper stick, swirled through three colours. We have made these the same way since day one.',
    90, { '1 piece': 90, 'Pack of 3': 250, 'Pack of 6': 480 }, [], 'lollipops', 80, 'Bestseller', 4.6, 187, 0],

  ['Unicorn Fantasy Lollipop', 'Swirls, sprinkles, edible glitter',
    'White chocolate swirled pink and lilac, finished with edible glitter and a few sprinkles. Mostly bought as much for the photo as the taste.',
    150, { '1 piece': 150, 'Pack of 3': 420 }, [], 'lollipops', 45, 'New', 4.8, 143, 1],

  ['Big Choco Disc Lollipop', 'A whole disc of solid chocolate',
    'A proper big disc — nearly the size of your palm — of 60% dark chocolate with a caramel core. You could probably use it as a small mirror.',
    120, { '1 piece': 120 }, [], 'lollipops', 60, null, 4.5, 96, 0],

  // --- Bites & Bark ---
  ['Choco Bark Bites', 'Snap into little pieces, share freely',
    'Thin dark chocolate bark scattered with dried fruit, nuts and a little sea salt, snapped into generous shards. Made for passing round.',
    260, { '100g': 260, '250g': 600 }, [], 'bites', 50, 'Bestseller', 4.7, 264, 1],

  ['Almond Bark Slab', 'Whole almonds, thick chocolate',
    'A thick slab of milk chocolate studded with whole toasted almonds. Break it off in big, satisfying pieces.',
    550, { '250g': 550 }, [], 'bites', 35, null, 4.6, 112, 0],

  ['Oreo Coated Bites', 'Cookies dipped twice for a proper shell',
    'Biscuit cookies dipped in dark chocolate and rolled in crushed chocolate cookie crumbs. Chewy in the middle, set firm outside.',
    220, { '6 pieces': 220, '12 pieces': 410 }, [], 'bites', 40, null, 4.4, 138, 0],

  ['Strawberry Dipped Bites', 'Real fruit, dark chocolate shell',
    'Fresh strawberries dipped in dark chocolate and chilled until set. We only do this in season, so availability moves quickly.',
    240, { '6 pieces': 240, '12 pieces': 450 }, [], 'bites', 40, 'Seasonal pick', 4.7, 87, 0],

  // --- Fudge & Brittle ---
  ['Classic Chocolate Fudge', 'Old-fashioned, spoon straight from the tin',
    'Proper fudge: condensed milk, chocolate and a whole lot of stirring at a low heat until it pulls away from the tin. Slice it thick.',
    320, { '250g': 320, '500g': 600 }, [], 'fudge', 40, 'Bestseller', 4.8, 201, 1],

  ['Peanut Butter Fudge', 'Crunchy, nutty, slightly salty',
    'Creamy peanut butter folded through dark chocolate fudge, finished with crushed roasted peanuts and a pinch of salt.',
    340, { '250g': 340, '500g': 640 }, [], 'fudge', 30, null, 4.7, 156, 0],

  ['Choco Walnut Brittle', 'Dark, snapping, walnut-heavy',
    'Sugar cooked to a deep amber, then loaded with walnuts and dark chocolate before it sets. Snaps into shards like toffee should.',
    380, { '200g': 380 }, [], 'fudge', 25, null, 4.5, 68, 0],

  // --- Hot Chocolate ---
  ['Rich Hot Chocolate', 'Shaker jar, six cups deep',
    'Real drinking chocolate made with cocoa powder and grated dark chocolate, not a syrup. Stir a heaped spoon into hot milk for the deepest cup.',
    180, { '100g jar': 180, '250g jar': 400 }, [], 'drinks', 50, 'Bestseller', 4.8, 289, 1],

  ['Hot Chocolate Mug Kit', 'Chocolate, mini marshmallows, a wooden spoon',
    'Everything for one perfect mug in a giftable box: a rich chocolate puck, mini marshmallows and a little wooden spoon to stir with.',
    320, { '1 kit': 320 }, [], 'drinks', 30, 'Gift idea', 4.6, 118, 0],

  // --- Combo Packs ---
  ['Chocolate Trio Box', 'Our three signature flavours, side by side',
    'Curated collection of our three signature flavours in one elegant box. Perfect for gifting, or for eating all of it yourself.',
    499, { small: 499, medium: 749, large: 1380 }, ['Pictures/CA6F6DAD-209B-456E-9B2F-50E69C4BFBE2.jpg'], 'combos', 25, null, 4.7, 176, 0],

  ['Assorted 12 Piece Sampler', 'A little of everything we make best',
    'Twelve bonbons drawn from our whole range — truffles, bark bites, a couple of caramels and two salted caramel pieces. The easy way to find your favourite.',
    780, { '12 pieces': 780 }, [], 'combos', 30, 'Bestseller', 4.8, 233, 1],

  ['Family Sharing Box', 'Plenty for the whole table',
    'Four full trays — bars, bonbons, bark and fudge — in one big box. Sized for movie night, or for a house full of hungry people.',
    1450, { 'Serves 8-10': 1450 }, [], 'combos', 20, null, 4.7, 104, 0],

  ['Two-Dozen Celebration Box', 'For the genuinely big occasions',
    'Twenty-four hand-finished bonbons arranged in a double-decker gift box with a ribbon and a handwritten card if you would like one.',
    2600, { '24 pieces': 2600 }, [], 'combos', 15, 'Premium', 4.9, 61, 0],

  // --- Gift Boxes ---
  ['Floral Artisan Chocolates', 'Rose, lavender and jasmine',
    'Exquisite handcrafted chocolates infused with natural floral essences. Each piece is a delicate masterpiece featuring rose, lavender and jasmine notes.',
    499, { small: 499, medium: 749, large: 1380 }, ['Pictures/83F17655-3427-4781-9564-94A5ED6C29C8.jpg'], 'gift-boxes', 50, 'Bestseller', 4.8, 312, 1],

  ['Dry Fruit Artisan Chocolates', 'Almonds, cashews, pistachio, raisins',
    'Premium dark chocolate packed with hand-selected almonds, cashews, pistachios and raisins. A perfect blend of crunch and sweetness.',
    499, { small: 499, medium: 749, large: 1380 }, ['Pictures/84B74416-EDF1-4056-973C-02667F74312B.jpg'], 'gift-boxes', 50, null, 4.7, 254, 0],

  ['Floral + Dry Fruit Artisan Chocolate', 'Half floral, half fruit — our favourite',
    'The best of both worlds — floral notes meet premium dry fruits in this combination. A symphony of flavours in every bite, and our most reordered gift box.',
    499, { small: 499, medium: 749, large: 1380 }, ['Pictures/8678FCA6-81D7-443F-BBD6-16A9BF6698CC.jpg'], 'gift-boxes', 40, 'Bestseller', 4.9, 341, 1],

  ['Corporate Gift Hamper', 'Branded, ribboned, delivered to their desk',
    'A large hamper of bars, bonbons and bark with space for your logo, wrapped in ribbon and shipped wherever your team is. Tell us your branding in the message box.',
    2900, { '10-15 people': 2900 }, [], 'gift-boxes', 10, 'Business orders', 4.8, 42, 0],

  // --- Seasonal ---
  ['Mono Beauty of Pinata', 'Limited edition, surprise centre',
    'Limited edition single-origin dark chocolate with a surprise centre. Each piece reveals a unique flavour journey as you bite in.',
    499, { small: 499, medium: 749, large: 1380 }, ['Pictures/single pinata.jpg'], 'seasonal', 20, 'Limited', 4.7, 158, 1],

  ['Valentine’s Love Box', 'Six bonbons, one love letter',
    'Six bonbons in rose, blush and deep red, packed with a blank card you can write on. Available for a short window around February.',
    950, { '6 pieces + card': 950 }, [], 'seasonal', 12, 'Seasonal pick', 4.8, 77, 0],

  ['Christmas Festive Box', 'Cinnamon, orange peel, winter spice',
    'Cinnamon and orange peel warmed into dark chocolate, with a scatter of spiced nuts. Packed in a deep red box with a ribbon.',
    1200, { '20 pieces': 1200 }, [], 'seasonal', 15, 'Seasonal pick', 4.6, 53, 0]
];

const insertProduct = db.prepare(`
  INSERT INTO products (
    name, tagline, description, base_price, sizes, images, category,
    stock_quantity, badge, rating, rating_count, is_featured
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = ?)
`);

let added = 0;
products.forEach(p => {
  const [name, tagline, description, basePrice, sizes, images, category, stock, badge, rating, ratingCount, featured] = p;
  const result = insertProduct.run(
    name, tagline, description, basePrice,
    JSON.stringify(sizes), JSON.stringify(images), category,
    stock, badge, rating, ratingCount, featured, name
  );
  if (result.changes) added += 1;
});

// Backfill the richer fields for products that were seeded by an older version.
const backfill = db.prepare(`
  UPDATE products SET
    tagline = COALESCE(NULLIF(tagline, ''), description),
    rating = COALESCE(rating, 4.6),
    rating_count = COALESCE(rating_count, 0)
  WHERE tagline IS NULL OR tagline = ''
`);
backfill.run();

const total = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;

console.log('Database initialized successfully!');
console.log(`  products: ${total} total (${added} added this run)`);
console.log('Admin login: admin@chocoluxe.com / admin123');
console.log('Customer login: customer@test.com / customer123');

db.close();
