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
    // Core tables
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

    // NEW: Vitals table for Apple Health data
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

    // NEW: Sleep table for Apple Health sleep data
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

    // NEW: Exercise/workouts table
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

    // NEW: Energy levels table
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

    // NEW: Meals table
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

    // NEW: Daily logs table for generic daily entries
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_logs (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

// ============ NEW: VITALS ENDPOINTS ============

// GET /api/vitals - Return all vitals data
app.get('/api/vitals', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM vitals ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Vitals GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vitals - Import a single vital record
app.post('/api/vitals', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { date, hrv, rhr, bloodOxygen, blood_oxygen, respiratoryRate, respiratory_rate, heartRate, heart_rate, source, notes } = req.body;
    
    // Handle both camelCase and snake_case field names
    const hrvValue = hrv || req.body.hrv_sdnn || null;
    const rhrValue = rhr || req.body.resting_hr || req.body.restingHr || null;
    const boValue = bloodOxygen || blood_oxygen || req.body.bloodOxygen || null;
    const rrValue = respiratoryRate || respiratory_rate || req.body.respiratoryRate || null;
    const hrValue = heartRate || heart_rate || req.body.heartRate || null;
    const sourceValue = source || req.body.sourceName || 'Apple Health';
    
    const result = await dbPool.query(
      `INSERT INTO vitals (date, hrv, rhr, blood_oxygen, respiratory_rate, heart_rate, source, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (date, source) 
       DO UPDATE SET 
         hrv = COALESCE(EXCLUDED.hrv, vitals.hrv),
         rhr = COALESCE(EXCLUDED.rhr, vitals.rhr),
         blood_oxygen = COALESCE(EXCLUDED.blood_oxygen, vitals.blood_oxygen),
         respiratory_rate = COALESCE(EXCLUDED.respiratory_rate, vitals.respiratory_rate),
         heart_rate = COALESCE(EXCLUDED.heart_rate, vitals.heart_rate),
         notes = EXCLUDED.notes
       RETURNING *`,
      [date, hrvValue, rhrValue, boValue, rrValue, hrValue, sourceValue, notes || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Vitals POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vitals/bulk - Import multiple vital records
app.post('/api/vitals/bulk', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records must be an array' });
    }
    
    const results = [];
    const errors = [];
    
    for (const record of records) {
      try {
        const { date, hrv, rhr, bloodOxygen, blood_oxygen, respiratoryRate, respiratory_rate, heartRate, heart_rate, source, notes } = record;
        const hrvValue = hrv || record.hrv_sdnn || null;
        const rhrValue = rhr || record.resting_hr || record.restingHr || null;
        const boValue = bloodOxygen || blood_oxygen || record.bloodOxygen || null;
        const rrValue = respiratoryRate || respiratory_rate || record.respiratoryRate || null;
        const hrValue = heartRate || heart_rate || record.heartRate || null;
        const sourceValue = source || record.sourceName || 'Apple Health';
        
        const result = await dbPool.query(
          `INSERT INTO vitals (date, hrv, rhr, blood_oxygen, respiratory_rate, heart_rate, source, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (date, source) 
           DO UPDATE SET 
             hrv = COALESCE(EXCLUDED.hrv, vitals.hrv),
             rhr = COALESCE(EXCLUDED.rhr, vitals.rhr),
             blood_oxygen = COALESCE(EXCLUDED.blood_oxygen, vitals.blood_oxygen),
             respiratory_rate = COALESCE(EXCLUDED.respiratory_rate, vitals.respiratory_rate),
             heart_rate = COALESCE(EXCLUDED.heart_rate, vitals.heart_rate),
             notes = EXCLUDED.notes
           RETURNING *`,
          [date, hrvValue, rhrValue, boValue, rrValue, hrValue, sourceValue, notes || null]
        );
        results.push(result.rows[0]);
      } catch (err) {
        errors.push({ record, error: err.message });
      }
    }
    
    res.status(201).json({ 
      success: results.length, 
      failed: errors.length, 
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Vitals bulk POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ NEW: SLEEP ENDPOINTS ============

// GET /api/sleep - Return all sleep data
app.get('/api/sleep', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM sleep ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Sleep GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sleep - Import a single sleep record
app.post('/api/sleep', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { 
      date, 
      hours, sleepHours, sleep_hours,
      deepSleep, deepSleepMinutes, deep_sleep_minutes,
      remSleep, remMinutes, rem_minutes,
      coreSleep, coreMinutes, core_minutes,
      awake, awakeMinutes, awake_minutes,
      quality, sleepQuality, sleep_quality,
      fellAsleep, fell_asleep,
      wokeUp, woke_up,
      source, sourceName,
      notes 
    } = req.body;
    
    // Handle various field name formats
    const sleepHoursValue = hours || sleepHours || sleep_hours || req.body.totalAsleep || null;
    const deepValue = deepSleep || deepSleepMinutes || deep_sleep_minutes || req.body.asleepDeep || null;
    const remValue = remSleep || remMinutes || rem_minutes || req.body.asleepREM || null;
    const coreValue = coreSleep || coreMinutes || core_minutes || req.body.asleepCore || null;
    const awakeValue = awake || awakeMinutes || awake_minutes || null;
    const qualityValue = quality || sleepQuality || sleep_quality || 7;
    const fellAsleepValue = fellAsleep || fell_asleep || req.body.fellAsleep || null;
    const wokeUpValue = wokeUp || woke_up || req.body.wokeUp || null;
    const sourceValue = source || sourceName || 'Apple Health';
    
    const result = await dbPool.query(
      `INSERT INTO sleep (date, sleep_hours, deep_sleep_minutes, rem_minutes, core_minutes, awake_minutes, sleep_quality, fell_asleep, woke_up, source, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (date, source) 
       DO UPDATE SET 
         sleep_hours = EXCLUDED.sleep_hours,
         deep_sleep_minutes = EXCLUDED.deep_sleep_minutes,
         rem_minutes = EXCLUDED.rem_minutes,
         core_minutes = EXCLUDED.core_minutes,
         awake_minutes = EXCLUDED.awake_minutes,
         sleep_quality = EXCLUDED.sleep_quality,
         fell_asleep = EXCLUDED.fell_asleep,
         woke_up = EXCLUDED.woke_up,
         notes = EXCLUDED.notes
       RETURNING *`,
      [date, sleepHoursValue, deepValue, remValue, coreValue, awakeValue, qualityValue, fellAsleepValue, wokeUpValue, sourceValue, notes || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Sleep POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sleep/bulk - Import multiple sleep records
app.post('/api/sleep/bulk', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records must be an array' });
    }
    
    const results = [];
    const errors = [];
    
    for (const record of records) {
      try {
        const { 
          date, 
          hours, sleepHours,
          deepSleep, deepSleepMinutes,
          remSleep, remMinutes,
          coreSleep, coreMinutes,
          awake, awakeMinutes,
          quality, sleepQuality,
          source, sourceName,
          notes 
        } = record;
        
        const sleepHoursValue = hours || sleepHours || record.totalAsleep || null;
        const deepValue = deepSleep || deepSleepMinutes || record.asleepDeep || null;
        const remValue = remSleep || remMinutes || record.asleepREM || null;
        const coreValue = coreSleep || coreMinutes || record.asleepCore || null;
        const awakeValue = awake || awakeMinutes || null;
        const qualityValue = quality || sleepQuality || 7;
        const sourceValue = source || sourceName || 'Apple Health';
        
        const result = await dbPool.query(
          `INSERT INTO sleep (date, sleep_hours, deep_sleep_minutes, rem_minutes, core_minutes, awake_minutes, sleep_quality, source, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (date, source) 
           DO UPDATE SET 
             sleep_hours = EXCLUDED.sleep_hours,
             deep_sleep_minutes = EXCLUDED.deep_sleep_minutes,
             rem_minutes = EXCLUDED.rem_minutes,
             core_minutes = EXCLUDED.core_minutes,
             awake_minutes = EXCLUDED.awake_minutes,
             sleep_quality = EXCLUDED.sleep_quality,
             notes = EXCLUDED.notes
           RETURNING *`,
          [date, sleepHoursValue, deepValue, remValue, coreValue, awakeValue, qualityValue, sourceValue, notes || null]
        );
        results.push(result.rows[0]);
      } catch (err) {
        errors.push({ record, error: err.message });
      }
    }
    
    res.status(201).json({ 
      success: results.length, 
      failed: errors.length, 
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Sleep bulk POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ NEW: EXERCISE ENDPOINTS ============

// GET /api/exercise - Return all exercise data
app.get('/api/exercise', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM exercise ORDER BY date DESC, created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Exercise GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exercise - Import a single exercise record
app.post('/api/exercise', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { 
      date, 
      type, workoutType, workoutActivityType,
      duration,
      durationUnit, duration_unit,
      calories, energyBurned,
      distance,
      distanceUnit, distance_unit,
      source, sourceName,
      notes 
    } = req.body;
    
    // Handle various field name formats
    const typeValue = type || workoutType || workoutActivityType || 'other';
    const durationUnitValue = durationUnit || duration_unit || 'min';
    const caloriesValue = calories || energyBurned || null;
    const distanceUnitValue = distanceUnit || distance_unit || null;
    const sourceValue = source || sourceName || 'Apple Health';
    
    const result = await dbPool.query(
      `INSERT INTO exercise (date, type, duration, duration_unit, calories, distance, distance_unit, source, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [date, typeValue, duration, durationUnitValue, caloriesValue, distance, distanceUnitValue, sourceValue, notes || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Exercise POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exercise/bulk - Import multiple exercise records
app.post('/api/exercise/bulk', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records must be an array' });
    }
    
    const results = [];
    const errors = [];
    
    for (const record of records) {
      try {
        const { 
          date, 
          type, workoutType, workoutActivityType,
          duration,
          calories, energyBurned,
          distance,
          source, sourceName,
          notes 
        } = record;
        
        const typeValue = type || workoutType || workoutActivityType || 'other';
        const caloriesValue = calories || energyBurned || null;
        const sourceValue = source || sourceName || 'Apple Health';
        
        const result = await dbPool.query(
          `INSERT INTO exercise (date, type, duration, duration_unit, calories, distance, source, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [date, typeValue, duration, 'min', caloriesValue, distance, sourceValue, notes || null]
        );
        results.push(result.rows[0]);
      } catch (err) {
        errors.push({ record, error: err.message });
      }
    }
    
    res.status(201).json({ 
      success: results.length, 
      failed: errors.length, 
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Exercise bulk POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ NEW: ENERGY ENDPOINTS ============

// GET /api/energy - Return all energy data
app.get('/api/energy', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM energy ORDER BY date DESC, time DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Energy GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/energy - Import a single energy record
app.post('/api/energy', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { date, time, level, source, notes } = req.body;
    
    const result = await dbPool.query(
      `INSERT INTO energy (date, time, level, source, notes) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [date, time || new Date().toTimeString().slice(0, 5), level, source || 'manual', notes || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Energy POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ NEW: MEALS ENDPOINTS ============

// GET /api/meals - Return all meal data
app.get('/api/meals', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM meals ORDER BY date DESC, time DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Meals GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meals - Import a single meal record
app.post('/api/meals', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { date, time, mealType, meal_type, foods, reaction, notes } = req.body;
    
    const result = await dbPool.query(
      `INSERT INTO meals (date, time, meal_type, foods, reaction, notes) 
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [date, time || new Date().toTimeString().slice(0, 5), mealType || meal_type, foods, reaction || 'none', notes || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Meals POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ NEW: DAILY LOGS ENDPOINTS ============

// GET /api/daily-logs - Return all daily logs
app.get('/api/daily-logs', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const result = await dbPool.query('SELECT * FROM daily_logs ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Daily logs GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/daily-logs - Import a daily log
app.post('/api/daily-logs', async (req, res) => {
  try {
    const dbPool = getPool();
    if (!dbPool) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    
    const { date, type, data } = req.body;
    
    const result = await dbPool.query(
      `INSERT INTO daily_logs (date, type, data) 
       VALUES ($1, $2, $3)
       RETURNING *`,
      [date, type, JSON.stringify(data)]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Daily logs POST error:', err);
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

// Database initialization endpoint
app.post('/api/admin/init-db', async (req, res) => {
  try {
    await initDatabase();
    res.json({ success: true, message: 'Database tables initialized' });
  } catch (err) {
    console.error('DB init endpoint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Default route - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Health Dashboard API running on port ${PORT}`);
});
