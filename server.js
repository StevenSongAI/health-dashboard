const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Cache-busting for static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1m', // 1 minute cache for development
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
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

// Initialize on startup
initDatabase();

// ============ API ROUTES ============

// --- Overview ---
app.get('/api/overview', async (req, res) => {
  try {
    const protocolResult = await pool.query('SELECT data FROM protocol_data ORDER BY updated_at DESC LIMIT 1');
    const protocol = protocolResult.rows[0]?.data || { supplements: [], phase: {} };
    
    const today = new Date().toISOString().split('T')[0];
    const symptomsResult = await pool.query('SELECT * FROM symptoms WHERE date = $1', [today]);
    
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
    const result = await pool.query('SELECT data FROM protocol_data ORDER BY updated_at DESC LIMIT 1');
    res.json(result.rows[0]?.data || { supplements: [], phase: {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/protocol', async (req, res) => {
  try {
    await pool.query('INSERT INTO protocol_data (data) VALUES ($1)', [JSON.stringify(req.body)]);
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Symptoms ---
app.get('/api/symptoms', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM symptoms ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/symptoms', async (req, res) => {
  try {
    const { date, time, type, severity, hrvValue, hrvBaseline, rhr, symptoms, notes, source } = req.body;
    const result = await pool.query(
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
    const result = await pool.query('SELECT * FROM briefings ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/briefings', async (req, res) => {
  try {
    const { type, date, content, insight, newFinding, findingTopic, priorities, reminders } = req.body;
    const result = await pool.query(
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
    const result = await pool.query('SELECT * FROM research ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/research', async (req, res) => {
  try {
    const { title, category, tags, summary, keyFindings, source, confidence, actionable, dateAdded, relevance } = req.body;
    const result = await pool.query(
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
    const result = await pool.query('SELECT * FROM symptoms WHERE type IN ($1, $2) ORDER BY created_at DESC', ['hrv', 'sleep']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inject fixed HRV loader script
app.get('/hrv-fix.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
// Fixed HRV Status Loader - Injected by server
async function loadHRVStatus() {
  console.log('[HRV FIX] Loading from /api/vitals...');
  try {
    const vitals = await apiGet('/api/vitals');
    console.log('[HRV FIX] Vitals count:', vitals?.length);
    
    if (!vitals || vitals.length === 0) {
      document.getElementById('hrv-current').textContent = '--';
      document.getElementById('hrv-status').textContent = 'No data';
      document.getElementById('hrv-recommendation').textContent = 'Log your HRV to see recommendations';
      return;
    }
    
    const sortedVitals = vitals.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestVital = sortedVitals.find(v => v.hrv !== null && v.hrv !== undefined);
    
    if (!latestVital) {
      document.getElementById('hrv-current').textContent = '--';
      document.getElementById('hrv-status').textContent = 'No data';
      document.getElementById('hrv-recommendation').textContent = 'Log your HRV to see recommendations';
      return;
    }
    
    const hrv = latestVital.hrv;
    const baseline = 61;
    const diff = hrv - baseline;
    const diffPercent = ((diff / baseline) * 100).toFixed(0);
    
    document.getElementById('hrv-current').textContent = hrv + 'ms';
    document.getElementById('hrv-trend').textContent = (diff >= 0 ? '+' : '') + diff + 'ms (' + diffPercent + '%) vs baseline';
    
    const hrvElement = document.getElementById('hrv-current');
    if (diff < -10) hrvElement.className = 'text-3xl font-bold text-accent-red';
    else if (diff < 0) hrvElement.className = 'text-3xl font-bold text-accent-yellow';
    else hrvElement.className = 'text-3xl font-bold text-accent-green';
    
    let status, recommendation, cardBorder;
    if (hrv < baseline - 10) {
      status = '🔴 CRITICAL - Below Baseline';
      recommendation = 'REDUCE Allimax to 1-cap today. Prioritize sleep. No training.';
      cardBorder = 'border-accent-red';
    } else if (hrv < baseline - 5) {
      status = '🟡 ELEVATED - Monitor Closely';
      recommendation = 'Consider reducing Allimax dose. Focus on recovery.';
      cardBorder = 'border-accent-yellow';
    } else if (hrv > baseline + 20) {
      status = '🟢 OPTIMAL - High Recovery';
      recommendation = 'Good recovery capacity. Protocol on track.';
      cardBorder = 'border-accent-green';
    } else {
      status = '🟢 NORMAL';
      recommendation = 'Maintain current protocol. Continue monitoring.';
      cardBorder = 'border-accent-green';
    }
    
    document.getElementById('hrv-status').textContent = status;
    document.getElementById('hrv-recommendation').textContent = recommendation;
    
    const card = document.getElementById('hrv-status-card');
    card.className = 'card p-6 mb-6 border-l-4 ' + cardBorder;
    
    const sleepData = await apiGet('/api/sleep');
    if (sleepData && sleepData.length > 0) {
      const latestSleep = sleepData.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (latestSleep && latestSleep.deepSleepMin) {
        document.getElementById('hrv-deep-sleep').textContent = 'Deep sleep: ' + latestSleep.deepSleepMin + 'min';
      }
    }
    
  } catch (error) {
    console.error('[HRV FIX] Error:', error);
    document.getElementById('hrv-status').textContent = 'Error loading data';
  }
}
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// Diagnostic page
app.get('/diagnostic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'diagnostic.html'));
});

// Default route - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Health Dashboard API running on port ${PORT}`);
});
