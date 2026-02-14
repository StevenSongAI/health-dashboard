const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection - initialize immediately if DATABASE_URL is available
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}
function getPool() {
  return pool;
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database tables
async function initDatabase() {
  if (!getPool()) {
    console.log('DATABASE_URL not set, skipping DB initialization');
    return;
  }
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS symptoms (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        time TEXT,
        type TEXT NOT NULL,
        severity INTEGER,
        hrv_value INTEGER,
        hrv_baseline INTEGER,
        rhr INTEGER,
        blood_oxygen INTEGER,
        respiratory_rate REAL,
        duration_hours REAL,
        quality INTEGER,
        deep_sleep_min INTEGER,
        rem_sleep_min INTEGER,
        exercise_type TEXT,
        duration INTEGER,
        calories INTEGER,
        symptoms TEXT[],
        notes TEXT,
        source TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS briefings (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        content TEXT,
        insight TEXT,
        new_finding BOOLEAN DEFAULT false,
        finding_topic TEXT,
        priorities TEXT[],
        reminders TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS research (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        tags TEXT[],
        summary TEXT,
        key_findings TEXT[],
        source TEXT,
        confidence TEXT,
        actionable BOOLEAN DEFAULT false,
        date_added TEXT,
        relevance TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS protocol_data (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

// Initialize on startup - don't block if DB fails
initDatabase().catch(err => console.error('DB init failed:', err.message));

// ============ API ROUTES ============

// --- Overview ---
app.get('/api/overview', async (req, res) => {
  try {
    const protocolResult = await getPool().query('SELECT data FROM protocol_data ORDER BY updated_at DESC LIMIT 1');
    const protocol = protocolResult.rows[0]?.data || { supplements: [], phase: {} };
    
    const today = new Date().toISOString().split('T')[0];
    const symptomsResult = await getPool().query('SELECT * FROM symptoms WHERE date = $1', [today]);
    
    res.json({
      protocol,
      todayStatus: {
        date: today,
        logsCount: symptomsResult.rows.length,
        supplementsTaken: 0,
        symptomsLogged: symptomsResult.rows.length
      },
      recentSymptoms: symptomsResult.rows.slice(-5),
      alerts: []
    });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Protocol ---
app.get('/api/protocol', async (req, res) => {
  try {
    const result = await getPool().query('SELECT data FROM protocol_data ORDER BY updated_at DESC LIMIT 1');
    res.json(result.rows[0]?.data || { supplements: [], phase: {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/protocol', async (req, res) => {
  try {
    await getPool().query('INSERT INTO protocol_data (data) VALUES ($1)', [JSON.stringify(req.body)]);
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Symptoms ---
app.get('/api/symptoms', async (req, res) => {
  try {
    const result = await getPool().query('SELECT * FROM symptoms ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/symptoms', async (req, res) => {
  try {
    const { date, time, type, severity, hrvValue, hrvBaseline, rhr, symptoms, notes, source } = req.body;
    const result = await getPool().query(
      `INSERT INTO symptoms (date, time, type, severity, hrv_value, hrv_baseline, rhr, symptoms, notes, source) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [date, time, type, severity, hrvValue, hrvBaseline, rhr, symptoms, notes, source]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Symptom insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Briefings ---
app.get('/api/briefings', async (req, res) => {
  try {
    const result = await getPool().query('SELECT * FROM briefings ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/briefings', async (req, res) => {
  try {
    const { type, date, content, insight, newFinding, findingTopic, priorities, reminders } = req.body;
    const result = await getPool().query(
      `INSERT INTO briefings (type, date, content, insight, new_finding, finding_topic, priorities, reminders) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [type, date, content, insight, newFinding, findingTopic, priorities, reminders]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Briefing insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Research ---
app.get('/api/research', async (req, res) => {
  try {
    const result = await getPool().query('SELECT * FROM research ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/research', async (req, res) => {
  try {
    const { title, category, tags, summary, keyFindings, source, confidence, actionable, dateAdded, relevance } = req.body;
    const result = await getPool().query(
      `INSERT INTO research (title, category, tags, summary, key_findings, source, confidence, actionable, date_added, relevance) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [title, category, tags, summary, keyFindings, source, confidence, actionable, dateAdded, relevance]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Research insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Vitals ---
app.get('/api/vitals', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM symptoms WHERE type IN ($1, $2) ORDER BY created_at DESC', ['hrv', 'sleep']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vitals', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { date, hrv, rhr, bloodOxygen, respiratoryRate, notes, type } = req.body;
    const recordType = type || 'hrv';
    const result = await dbPool.query(
      `INSERT INTO symptoms (date, type, hrv_value, rhr, blood_oxygen, respiratory_rate, notes, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [date, recordType, hrv, rhr, bloodOxygen, respiratoryRate, notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Vitals insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Sleep ---
app.get('/api/sleep', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM symptoms WHERE type = $1 ORDER BY created_at DESC', ['sleep']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sleep', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { date, durationHours, quality, deepSleepMin, remSleepMin, notes } = req.body;
    const result = await dbPool.query(
      `INSERT INTO symptoms (date, type, duration_hours, quality, deep_sleep_min, rem_sleep_min, notes, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [date, 'sleep', durationHours, quality, deepSleepMin, remSleepMin, notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Sleep insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Symptoms ---
app.get('/api/symptoms', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM symptoms ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/symptoms', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { date, type, severity, notes, timeOfDay } = req.body;
    const result = await dbPool.query(
      `INSERT INTO symptoms (date, type, severity, notes, time, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [date, type, severity, notes, timeOfDay]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Symptoms insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Exercise ---
app.get('/api/exercise', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM symptoms WHERE type = $1 ORDER BY created_at DESC', ['exercise']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/exercise', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { date, type, duration, calories, notes } = req.body;
    const result = await dbPool.query(
      `INSERT INTO symptoms (date, type, exercise_type, duration, calories, notes, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [date, 'exercise', type, duration, calories, notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Exercise insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check - MUST be before catch-all
app.get('/health', async (req, res) => {
  try {
    const dbPool = getPool();
    if (dbPool) {
      await dbPool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } else {
      res.json({ status: 'ok', database: 'not_configured', message: 'DATABASE_URL not set' });
    }
  } catch (err) {
    res.json({ status: 'ok', database: 'error', error: err.message });
  }
});

// Default route - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Health Dashboard API running on port ${PORT}`);
});
