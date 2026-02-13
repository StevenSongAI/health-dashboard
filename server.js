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

// ============ SIBO COMPREHENSIVE MANAGEMENT ============

// --- Die-Off Manager ---
app.get('/api/dieoff/episodes', (req, res) => {
  res.json(readJSON('dieoff_episodes.json', []));
});

app.post('/api/dieoff/episodes', (req, res) => {
  const episode = appendToArray('dieoff_episodes.json', req.body);
  res.json(episode);
});

app.get('/api/dieoff/protocols', (req, res) => {
  const protocols = {
    mild: {
      severity: '1-4/10',
      actions: ['Continue antimicrobials', 'Activated charcoal 500mg', 'Hydrate 3L+', 'Rest'],
      continueTreatment: true
    },
    moderate: {
      severity: '5-7/10', 
      actions: ['Reduce antimicrobial dose 50%', 'NAC 600mg BID', 'Bentonite clay', 'Liver support'],
      continueTreatment: true
    },
    severe: {
      severity: '8-10/10',
      actions: ['PAUSE antimicrobials', 'Contact provider', 'Aggressive binding', 'Hydration IV if needed'],
      continueTreatment: false
    }
  };
  res.json(protocols);
});

// --- SIFO Risk Assessment ---
app.get('/api/sifo/assessment', (req, res) => {
  const assessments = readJSON('sifo_assessments.json', []);
  res.json(assessments);
});

app.post('/api/sifo/assessment', (req, res) => {
  const { riskFactors } = req.body;
  
  // Calculate risk score
  const weights = {
    antibioticUse: 4,
    highSugarDiet: 3,
    oralSteroids: 4,
    ppiUse: 3,
    whiteTongue: 3,
    brainFog: 3,
    sugarCravings: 3,
    recurrentInfections: 4,
    skinIssues: 2,
    genitalSymptoms: 3
  };
  
  let score = 0;
  riskFactors.forEach(factor => {
    score += weights[factor] || 1;
  });
  
  const riskLevel = score >= 12 ? 'high' : score >= 7 ? 'moderate' : 'low';
  
  const assessment = appendToArray('sifo_assessments.json', {
    score,
    riskLevel,
    riskFactors,
    recommendations: getSifoRecommendations(riskLevel)
  });
  
  res.json(assessment);
});

function getSifoRecommendations(riskLevel) {
  const recs = {
    low: ['S. boulardii 250mg daily', 'Monitor during treatment'],
    moderate: ['S. boulardii 500mg BID', 'Caprylic acid', 'Consider antifungal rotation'],
    high: ['Full SIFO protocol', 'Prescription antifungal', 'Strict diet', 'Biofilm disruptors']
  };
  return recs[riskLevel] || recs.low;
}

// --- Treatment History / Refractory Analysis ---
app.get('/api/treatment-history', (req, res) => {
  res.json(readJSON('treatment_history.json', []));
});

app.post('/api/treatment-history', (req, res) => {
  const treatment = appendToArray('treatment_history.json', req.body);
  res.json(treatment);
});

app.get('/api/treatment-history/analysis', (req, res) => {
  const treatments = readJSON('treatment_history.json', []);
  
  // Analyze failure patterns
  const patterns = {
    insufficientDuration: treatments.filter(t => t.durationWeeks < 8 && t.outcome === 'relapse').length,
    noBiofilmDisruption: treatments.filter(t => !t.biofilmDisruptors && t.outcome === 'relapse').length,
    inadequateDosing: treatments.filter(t => t.underdosed && t.outcome !== 'resolved').length,
    noProkinetic: treatments.filter(t => !t.prokinetic && t.outcome !== 'resolved').length
  };
  
  const total = treatments.length;
  const analysis = {
    totalTreatments: total,
    patterns: {
      insufficientDuration: { count: patterns.insufficientDuration, pct: total ? (patterns.insufficientDuration/total*100).toFixed(1) : 0 },
      noBiofilmDisruption: { count: patterns.noBiofilmDisruption, pct: total ? (patterns.noBiofilmDisruption/total*100).toFixed(1) : 0 },
      inadequateDosing: { count: patterns.inadequateDosing, pct: total ? (patterns.inadequateDosing/total*100).toFixed(1) : 0 },
      noProkinetic: { count: patterns.noProkinetic, pct: total ? (patterns.noProkinetic/total*100).toFixed(1) : 0 }
    },
    recommendations: generateProtocolRecommendations(patterns, total)
  };
  
  res.json(analysis);
});

function generateProtocolRecommendations(patterns, total) {
  if (!total) return ['Start with refractory protocol analysis'];
  
  const recs = [];
  if (patterns.noBiofilmDisruption >= 2) recs.push('Biofilm disruption phase required (4 weeks)');
  if (patterns.insufficientDuration >= 2) recs.push('Extend to 16-week intensive protocol');
  if (patterns.inadequateDosing >= 1) recs.push('Use therapeutic dosing (Allicin 1350mg/day)');
  if (patterns.noProkinetic >= 2) recs.push('Prokinetic mandatory throughout');
  
  return recs.length ? recs : ['Standard 16-week protocol recommended'];
}

// --- Protocol Schedules (16-week intensive) ---
app.get('/api/protocol-schedule/:week', (req, res) => {
  const week = parseInt(req.params.week);
  
  const schedules = {
    biofilm: {
      phase: 'Biofilm Disruption',
      weeks: '1-4',
      supplements: [
        { name: 'EDTA', dose: '500mg', timing: 'AM fasted', when: 'Daily' },
        { name: 'NAC', dose: '600mg', timing: 'AM fasted', when: 'Daily' },
        { name: 'Bismuth', dose: '300mg', timing: 'With meals', when: '3x daily' }
      ],
      noAntimicrobials: true,
      duration: 4
    },
    active: {
      phase: 'Active Antimicrobial', 
      weeks: '5-12',
      supplements: [
        { name: 'Allicin', dose: '450mg', timing: 'AM fasted, with lunch, with dinner', when: 'TID' },
        { name: 'Neem', dose: '300mg', timing: 'With Allicin', when: 'TID' },
        { name: 'Berberine', dose: '500mg', timing: 'With meals', when: 'TID' }
      ],
      dailyTotals: { allicin: '1350mg', neem: '900mg', berberine: '1500mg' },
      duration: 8
    },
    consolidation: {
      phase: 'Consolidation',
      weeks: '13-16', 
      supplements: [
        { name: 'Allicin', dose: '450mg', timing: 'With breakfast, with dinner', when: 'BID' },
        { name: 'Neem', dose: '300mg', timing: 'With Allicin', when: 'BID' }
      ],
      duration: 4
    }
  };
  
  if (week <= 4) res.json(schedules.biofilm);
  else if (week <= 12) res.json(schedules.active);
  else if (week <= 16) res.json(schedules.consolidation);
  else res.json({ phase: 'Protocol Complete', maintenance: true });
});

// --- Relapse Prevention (Post-Protocol) ---
app.get('/api/maintenance/schedule', (req, res) => {
  const protocolEnd = readJSON('protocol_end_date.json', null);
  if (!protocolEnd) return res.json({ error: 'No protocol completion recorded' });
  
  const endDate = new Date(protocolEnd.date);
  const weeksSince = Math.floor((new Date() - endDate) / (7 * 24 * 60 * 60 * 1000));
  
  let phase, schedule;
  if (weeksSince <= 4) {
    phase = 'Critical Window';
    schedule = { prokinetic: 'Full dose - DO NOT TAPER', antimicrobials: 'None', monitoring: 'Daily' };
  } else if (weeksSince <= 12) {
    phase = 'Consolidation';
    schedule = { prokinetic: 'Full dose', antimicrobials: 'Pulsed 1wk on/3wk off', monitoring: 'Weekly' };
  } else if (weeksSince <= 26) {
    phase = 'Maintenance';
    schedule = { prokinetic: 'Taper 25%/month', antimicrobials: '3 days monthly', monitoring: 'Bi-weekly' };
  } else {
    phase = 'Sustain';
    schedule = { prokinetic: 'As needed', antimicrobials: '1-2 days monthly', monitoring: 'Monthly' };
  }
  
  res.json({ weeksSince, phase, schedule });
});

app.post('/api/protocol/complete', (req, res) => {
  writeJSON('protocol_end_date.json', { date: new Date().toISOString() });
  res.json({ success: true, message: 'Protocol completion recorded. Begin relapse prevention.' });
});

// --- Medical Report Generation ---
app.get('/api/reports/medical', (req, res) => {
  const report = generateMedicalReport();
  res.json(report);
});

app.get('/api/reports/weekly', (req, res) => {
  const report = generateWeeklyReport();
  res.json(report);
});

function generateMedicalReport() {
  const treatments = readJSON('treatment_history.json', []);
  const symptoms = readJSON('symptoms.json', []);
  const episodes = readJSON('dieoff_episodes.json', []);
  const protocol = readJSON('protocol.json', {});
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentSymptoms = symptoms.filter(s => new Date(s.createdAt) > thirtyDaysAgo);
  const recentEpisodes = episodes.filter(e => new Date(e.createdAt) > thirtyDaysAgo);
  
  // Calculate symptom averages
  const symptomTypes = {};
  recentSymptoms.forEach(s => {
    if (!symptomTypes[s.type]) symptomTypes[s.type] = [];
    symptomTypes[s.type].push(s.severity);
  });
  
  const averages = {};
  Object.keys(symptomTypes).forEach(type => {
    const values = symptomTypes[type];
    averages[type] = {
      avg: (values.reduce((a,b) => a+b, 0) / values.length).toFixed(1),
      count: values.length,
      latest: values[values.length-1]
    };
  });
  
  return {
    generatedAt: new Date().toISOString(),
    treatmentHistory: {
      total: treatments.length,
      recent: treatments.slice(-3)
    },
    currentProtocol: protocol,
    symptomSummary: {
      period: '30 days',
      averages,
      totalLogged: recentSymptoms.length
    },
    dieoffEpisodes: {
      count: recentEpisodes.length,
      avgSeverity: recentEpisodes.length ? 
        (recentEpisodes.reduce((a,b) => a + (b.severity || 0), 0) / recentEpisodes.length).toFixed(1) : 0
    }
  };
}

function generateWeeklyReport() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const symptoms = readJSON('symptoms.json', []);
  const logs = readJSON('daily_logs.json', []);
  const episodes = readJSON('dieoff_episodes.json', []);
  
  const recentSymptoms = symptoms.filter(s => new Date(s.createdAt) > sevenDaysAgo);
  const recentLogs = logs.filter(l => new Date(l.createdAt) > sevenDaysAgo);
  const recentEpisodes = episodes.filter(e => new Date(e.createdAt) > sevenDaysAgo);
  
  // Calculate adherence
  const supplementLogs = recentLogs.filter(l => l.type === 'supplement');
  const expectedDoses = 21; // 3x daily x 7 days (simplified)
  const adherenceRate = Math.min(100, Math.round((supplementLogs.length / expectedDoses) * 100));
  
  return {
    period: '7 days',
    adherence: { rate: adherenceRate, logs: supplementLogs.length },
    symptoms: { count: recentSymptoms.length, types: [...new Set(recentSymptoms.map(s => s.type))] },
    dieoffEpisodes: recentEpisodes.length,
    generatedAt: new Date().toISOString()
  };
}

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