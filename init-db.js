const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('Creating vitals table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vitals (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        hrv DECIMAL(10,2),
        rhr DECIMAL(10,2),
        blood_oxygen DECIMAL(5,2),
        respiratory_rate DECIMAL(10,2),
        heart_rate DECIMAL(10,2),
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, source)
      )
    `);
    console.log('✓ vitals table created');

    console.log('Creating sleep table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sleep (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        sleep_hours DECIMAL(5,2),
        deep_sleep_minutes INTEGER,
        rem_minutes INTEGER,
        core_minutes INTEGER,
        awake_minutes INTEGER,
        sleep_quality INTEGER,
        fell_asleep TEXT,
        woke_up TEXT,
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, source)
      )
    `);
    console.log('✓ sleep table created');

    console.log('Creating exercise table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS exercise (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        duration DECIMAL(10,2),
        duration_unit TEXT DEFAULT 'min',
        calories INTEGER,
        distance DECIMAL(10,2),
        distance_unit TEXT,
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ exercise table created');

    console.log('Creating energy table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS energy (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        time TEXT,
        level INTEGER,
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ energy table created');

    console.log('Creating meals table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS meals (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        time TEXT,
        meal_type TEXT,
        foods TEXT,
        reaction TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ meals table created');

    console.log('Creating daily_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_logs (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ daily_logs table created');

    console.log('\n✅ All tables created successfully!');
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase();
