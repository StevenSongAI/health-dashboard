const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions
const getDataPath = (filename) => path.join(DATA_DIR, filename);

const readJSON = (filename, defaultValue = {}) => {
  try {
    const data = fs.readFileSync(getDataPath(filename), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return defaultValue;
  }
};

const writeJSON = (filename, data) => {
  fs.writeFileSync(getDataPath(filename), JSON.stringify(data, null, 2));
  return data;
};

const appendToArray = (filename, item) => {
  const data = readJSON(filename, []);
  data.push({ ...item, id: Date.now().toString(), createdAt: new Date().toISOString() });
  writeJSON(filename, data);
  return data[data.length - 1];
};

// ============ API ROUTES ============

// --- Overview ---
app.get('/api/overview', (req, res) => {
  const protocol = readJSON('protocol.json', { supplements: [], phase: {} });
  const todayLogs = readJSON('daily_logs.json', []);
  const symptoms = readJSON('symptoms.json', []);
  const alerts = readJSON('alerts.json', []);
  
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = todayLogs.filter(log => log.date === today);
  
  res.json({
    protocol,
    todayStatus: {
      date: today,
      logsCount: todayEntries.length,
      supplementsTaken: todayEntries.filter(e => e.type === 'supplement').length,
      symptomsLogged: todayEntries.filter(e => e.type === 'symptom').length
    },
    recentSymptoms: symptoms.slice(-5),
    alerts: alerts.slice(-5)
  });
});

// --- Protocol ---
app.get('/api/protocol', (req, res) => {
  res.json(readJSON('protocol.json', { supplements: [], phase: {} }));
});

app.post('/api/protocol', (req, res) => {
  const protocol = writeJSON('protocol.json', req.body);
  res.json(protocol);
});

app.post('/api/protocol/supplement', (req, res) => {
  const protocol = readJSON('protocol.json', { supplements: [], phase: {} });
  protocol.supplements.push({ ...req.body, id: Date.now().toString() });
  writeJSON('protocol.json', protocol);
  res.json(protocol);
});

// --- Symptom Tracker ---
app.get('/api/symptoms', (req, res) => {
  res.json(readJSON('symptoms.json', []));
});

app.post('/api/symptoms', (req, res) => {
  const symptom = appendToArray('symptoms.json', req.body);
  res.json(symptom);
});

app.get('/api/symptoms/trends', (req, res) => {
  const symptoms = readJSON('symptoms.json', []);
  const grouped = {};
  
  symptoms.forEach(s => {
    if (!grouped[s.type]) grouped[s.type] = [];
    grouped[s.type].push({ date: s.date || s.createdAt, severity: s.severity });
  });
  
  res.json(grouped);
});

// --- Meals & Reactions ---
app.get('/api/meals', (req, res) => {
  res.json(readJSON('meals.json', []));
});

app.post('/api/meals', (req, res) => {
  const meal = appendToArray('meals.json', req.body);
  res.json(meal);
});

app.get('/api/reactions', (req, res) => {
  res.json(readJSON('reactions.json', []));
});

app.post('/api/reactions', (req, res) => {
  const reaction = appendToArray('reactions.json', req.body);
  res.json(reaction);
});

// --- Vitals & Energy ---
app.get('/api/vitals', (req, res) => {
  res.json(readJSON('vitals.json', []));
});

app.post('/api/vitals', (req, res) => {
  const vital = appendToArray('vitals.json', req.body);
  res.json(vital);
});

app.get('/api/energy', (req, res) => {
  res.json(readJSON('energy.json', []));
});

app.post('/api/energy', (req, res) => {
  const entry = appendToArray('energy.json', req.body);
  res.json(entry);
});

// --- Sleep ---
app.get('/api/sleep', (req, res) => {
  res.json(readJSON('sleep.json', []));
});

app.post('/api/sleep', (req, res) => {
  const entry = appendToArray('sleep.json', req.body);
  res.json(entry);
});

// --- Exercise ---
app.get('/api/exercise', (req, res) => {
  res.json(readJSON('exercise.json', []));
});

app.post('/api/exercise', (req, res) => {
  const entry = appendToArray('exercise.json', req.body);
  res.json(entry);
});

// --- Research ---
app.get('/api/research', (req, res) => {
  res.json(readJSON('research.json', []));
});

app.post('/api/research', (req, res) => {
  const study = appendToArray('research.json', req.body);
  res.json(study);
});

app.get('/api/research/search', (req, res) => {
  const { q } = req.query;
  const research = readJSON('research.json', []);
  const filtered = research.filter(r => 
    r.title?.toLowerCase().includes(q.toLowerCase()) ||
    r.summary?.toLowerCase().includes(q.toLowerCase()) ||
    r.tags?.some(tag => tag.toLowerCase().includes(q.toLowerCase()))
  );
  res.json(filtered);
});

// --- Briefings ---
app.get('/api/briefings', (req, res) => {
  res.json(readJSON('briefings.json', []));
});

app.post('/api/briefings', (req, res) => {
  const briefing = appendToArray('briefings.json', req.body);
  res.json(briefing);
});

// --- Daily Logs (quick log) ---
app.get('/api/daily-logs', (req, res) => {
  res.json(readJSON('daily_logs.json', []));
});

app.post('/api/daily-logs', (req, res) => {
  const log = appendToArray('daily_logs.json', req.body);
  res.json(log);
});

// --- Alerts ---
app.get('/api/alerts', (req, res) => {
  res.json(readJSON('alerts.json', []));
});

app.post('/api/alerts', (req, res) => {
  const alert = appendToArray('alerts.json', req.body);
  res.json(alert);
});

app.post('/api/alerts/:id/dismiss', (req, res) => {
  const alerts = readJSON('alerts.json', []);
  const alert = alerts.find(a => a.id === req.params.id);
  if (alert) {
    alert.dismissed = true;
    writeJSON('alerts.json', alerts);
  }
  res.json(alerts);
});

// --- Reintroduction Tracker ---
app.get('/api/reintroductions', (req, res) => {
  res.json(readJSON('reintroductions.json', []));
});

app.post('/api/reintroductions', (req, res) => {
  const entry = appendToArray('reintroductions.json', req.body);
  res.json(entry);
});

app.patch('/api/reintroductions/:id', (req, res) => {
  const reintroductions = readJSON('reintroductions.json', []);
  const entry = reintroductions.find(r => r.id === req.params.id);
  if (entry) {
    Object.assign(entry, req.body, { updatedAt: new Date().toISOString() });
    writeJSON('reintroductions.json', reintroductions);
  }
  res.json(entry);
});

// --- Agent Update Endpoints ---
app.post('/api/agent/protocol-update', (req, res) => {
  const { supplement, timing, dosage, notes } = req.body;
  const protocol = readJSON('protocol.json', { supplements: [], phase: {}, history: [] });
  
  protocol.history = protocol.history || [];
  protocol.history.push({
    type: 'update',
    supplement,
    timing,
    dosage,
    notes,
    timestamp: new Date().toISOString()
  });
  
  writeJSON('protocol.json', protocol);
  
  // Create alert
  appendToArray('alerts.json', {
    type: 'protocol_update',
    message: `Protocol updated: ${supplement} ${dosage}`,
    details: notes,
    priority: 'medium'
  });
  
  res.json({ success: true, message: 'Protocol updated' });
});

app.post('/api/agent/symptom-report', (req, res) => {
  const { symptom, severity, notes, correlation } = req.body;
  
  appendToArray('symptoms.json', {
    type: symptom,
    severity,
    notes,
    correlation,
    reportedBy: 'agent'
  });
  
  if (severity >= 7) {
    appendToArray('alerts.json', {
      type: 'high_severity_symptom',
      message: `High severity ${symptom} reported: ${severity}/10`,
      priority: 'high'
    });
  }
  
  res.json({ success: true, message: 'Symptom recorded' });
});

app.post('/api/agent/research-findings', (req, res) => {
  const { title, summary, source, relevance, tags } = req.body;
  
  const study = appendToArray('research.json', {
    title,
    summary,
    source,
    relevance,
    tags: tags || [],
    addedBy: 'agent',
    read: false
  });
  
  appendToArray('alerts.json', {
    type: 'new_research',
    message: `New research added: ${title}`,
    priority: 'low'
  });
  
  res.json({ success: true, study });
});

app.post('/api/agent/briefing', (req, res) => {
  const { type, content, highlights } = req.body;
  
  const briefing = appendToArray('briefings.json', {
    type, // 'morning' or 'evening'
    content,
    highlights: highlights || [],
    generatedBy: 'agent'
  });
  
  res.json({ success: true, briefing });
});

app.post('/api/agent/meal-reaction', (req, res) => {
  const { food, reaction, severity, timing, notes } = req.body;
  
  appendToArray('reactions.json', {
    food,
    reaction,
    severity,
    timing,
    notes,
    reportedBy: 'agent'
  });
  
  res.json({ success: true, message: 'Reaction recorded' });
});

// --- Apple Health Data ---
app.get('/api/apple-health', (req, res) => {
  try {
    // Helper to parse CSV
    const parseCSV = (filename) => {
      const filePath = path.join(DATA_DIR, filename);
      if (!fs.existsSync(filePath)) return [];
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      const headers = lines[0].split(',');
      
      return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, i) => {
          obj[header.trim()] = values[i]?.trim() || '';
        });
        return obj;
      });
    };

    // Parse daily summary
    const dailySummary = parseCSV('daily_summary.csv').map(row => ({
      date: row.date,
      sleepHours: parseFloat(row.sleep_hours) || 0,
      hrvAvg: parseFloat(row.hrv_avg) || 0,
      workouts: parseInt(row.workouts) || 0
    }));

    // Parse HRV data - aggregate by date
    const hrvData = parseCSV('hrv_data.csv');
    const hrvByDate = {};
    hrvData.forEach(row => {
      const date = row.date;
      const hrv = parseFloat(row.hrv_ms) || 0;
      if (!hrvByDate[date]) hrvByDate[date] = { values: [], avg: 0, min: 0, max: 0 };
      hrvByDate[date].values.push(hrv);
    });
    
    Object.keys(hrvByDate).forEach(date => {
      const values = hrvByDate[date].values;
      hrvByDate[date].avg = values.reduce((a, b) => a + b, 0) / values.length;
      hrvByDate[date].min = Math.min(...values);
      hrvByDate[date].max = Math.max(...values);
      delete hrvByDate[date].values;
    });

    // Parse sleep data - aggregate by date
    const sleepData = parseCSV('sleep_data.csv');
    const sleepByDate = {};
    sleepData.forEach(row => {
      const date = row.date;
      if (!sleepByDate[date]) {
        sleepByDate[date] = { 
          totalMinutes: 0, 
          stages: { core: 0, deep: 0, rem: 0, awake: 0 },
          startTime: row.start,
          endTime: row.end
        };
      }
      
      const start = new Date(row.start);
      const end = new Date(row.end);
      const duration = (end - start) / (1000 * 60); // minutes
      
      sleepByDate[date].totalMinutes += duration;
      
      const stage = row.value;
      if (stage.includes('Core')) sleepByDate[date].stages.core += duration;
      else if (stage.includes('Deep')) sleepByDate[date].stages.deep += duration;
      else if (stage.includes('REM')) sleepByDate[date].stages.rem += duration;
      else if (stage.includes('Awake')) sleepByDate[date].stages.awake += duration;
    });

    // Convert minutes to hours
    Object.keys(sleepByDate).forEach(date => {
      const s = sleepByDate[date];
      s.totalHours = s.totalMinutes / 60;
      s.stages.core = s.stages.core / 60;
      s.stages.deep = s.stages.deep / 60;
      s.stages.rem = s.stages.rem / 60;
      s.stages.awake = s.stages.awake / 60;
    });

    // Get last 30 days of data
    const last30Days = dailySummary.slice(-30);
    const recentHrv = Object.entries(hrvByDate).slice(-30);
    const recentSleep = Object.entries(sleepByDate).slice(-30);

    res.json({
      summary: {
        totalDays: dailySummary.length,
        dateRange: {
          start: dailySummary[0]?.date || null,
          end: dailySummary[dailySummary.length - 1]?.date || null
        }
      },
      dailySummary: last30Days,
      hrvData: recentHrv.map(([date, data]) => ({ date, ...data })),
      sleepData: recentSleep.map(([date, data]) => ({ date, ...data })),
      allHrvByDate: hrvByDate,
      allSleepByDate: sleepByDate
    });
  } catch (err) {
    console.error('Error reading Apple Health data:', err);
    res.status(500).json({ error: 'Failed to read Apple Health data', details: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all - serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Health Dashboard running on port ${PORT}`);
  console.log(`📊 Data directory: ${DATA_DIR}`);
});

module.exports = app;