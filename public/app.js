// Health Dashboard App
const API_BASE = '';
let currentTab = 'overview';
let protocolData = null;
let charts = {};

// Initialize
async function init() {
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  // Set default time for symptom form
  const now = new Date();
  document.getElementById('symptom-time').value = now.toTimeString().slice(0, 5);
  
  await loadProtocol();
  await loadOverview();
  await loadResearch();
  await loadBriefings();
  
  setupEventListeners();
  setupSliders();
}

// Tab Navigation
function showTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
  
  // Show selected tab
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.getElementById(`nav-${tabName}`).classList.add('active');
  
  currentTab = tabName;
  
  // Load tab-specific data
  if (tabName === 'symptoms') loadSymptoms();
  if (tabName === 'meals') loadMeals();
  if (tabName === 'vitals') loadVitals();
  if (tabName === 'sleep') loadSleep();
  if (tabName === 'protocol') renderProtocol();
  if (tabName === 'sibo-advanced') {
    // Initialize first SIBO section
    showSiboSection('dieoff');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Symptom form
  document.getElementById('symptom-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await logSymptom();
  });
  
  // Meal form
  document.getElementById('meal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await logMeal();
  });
  
  // Energy form
  document.getElementById('energy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await logEnergy();
  });
  
  // Sleep form
  document.getElementById('sleep-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await logSleep();
  });
  
  // Exercise form
  document.getElementById('exercise-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await logExercise();
  });
  
  // Search on enter
  document.getElementById('research-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchResearch();
  });
}

// Setup Sliders
function setupSliders() {
  // Symptom severity
  const symptomSlider = document.getElementById('symptom-severity');
  const symptomValue = document.getElementById('severity-value');
  symptomSlider.addEventListener('input', () => {
    symptomValue.textContent = symptomSlider.value;
  });
  
  // Energy level
  const energySlider = document.getElementById('energy-level');
  const energyValue = document.getElementById('energy-value');
  energySlider.addEventListener('input', () => {
    energyValue.textContent = energySlider.value;
  });
}

// API Helpers
async function apiGet(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`DEBUG: apiGet() fetching from: ${url}`);
  try {
    const res = await fetch(url);
    console.log(`DEBUG: apiGet() response status: ${res.status} ${res.statusText}`);
    
    if (!res.ok) {
      console.error(`DEBUG: apiGet() HTTP error! status: ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    console.log(`DEBUG: apiGet() received data type:`, typeof data);
    return data;
  } catch (err) {
    console.error('DEBUG: apiGet() Error:', err);
    console.error('DEBUG: apiGet() Error stack:', err.stack);
    return null;
  }
}

async function apiPost(endpoint, data) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    return null;
  }
}

// Load Protocol
async function loadProtocol() {
  protocolData = await apiGet('/api/protocol');
}

// Alert System - Check health trends and generate alerts
async function checkAlerts() {
  const alerts = [];
  
  // Fetch vitals and sleep data for trend analysis
  let [vitals, sleep, dailyLogs] = await Promise.all([
    apiGet('/api/vitals'),
    apiGet('/api/sleep'),
    apiGet('/api/daily-logs')
  ]);
  
  // Parse vitals string values to numbers (API returns strings like "44.35")
  if (vitals && Array.isArray(vitals)) {
    vitals = vitals.map(v => ({
      ...v,
      hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null,
      rhr: v.rhr !== null && v.rhr !== undefined ? parseFloat(v.rhr) : null
    }));
  }
  
  // Map sleep API field names to frontend expected names
  if (sleep && Array.isArray(sleep)) {
    sleep = sleep.map(s => ({
      ...s,
      totalHours: s.totalHours !== undefined ? s.totalHours : 
                  s.durationHours !== undefined ? s.durationHours : 
                  s.sleep_hours !== undefined ? parseFloat(s.sleep_hours) : 
                  s.duration || 0,
      deepSleepMinutes: s.deepSleepMinutes !== undefined ? s.deepSleepMinutes : 
                        s.deepSleepMin !== undefined ? s.deepSleepMin : 
                        s.deep_sleep_minutes !== undefined ? s.deep_sleep_minutes : 0,
      date: s.date || (s.createdAt ? s.createdAt.split('T')[0] : null)
    }));
  }
  
  // ========== HRV ALERTS ==========
  if (vitals && vitals.length > 0) {
    // Sort by date descending
    const sortedVitals = vitals
      .filter(v => v.hrv !== null && v.hrv !== undefined && !isNaN(v.hrv))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sortedVitals.length >= 2) {
      // Check for CRITICAL: HRV < 51ms for 2+ consecutive days
      let criticalStreak = 0;
      for (const vital of sortedVitals) {
        if (vital.hrv < 51) {
          criticalStreak++;
        } else {
          break;
        }
      }
      
      if (criticalStreak >= 2) {
        alerts.push({
          priority: 'high',
          message: `CRITICAL: HRV below 51ms for ${criticalStreak} consecutive days`,
          recommendation: 'Reduce Allimax to 1-cap. Prioritize sleep. No training until HRV recovers.',
          type: 'hrv',
          icon: '🔴'
        });
      }
      // Check for WARNING: HRV < 61ms for 3+ consecutive days
      else {
        let warningStreak = 0;
        for (const vital of sortedVitals) {
          if (vital.hrv < 61) {
            warningStreak++;
          } else {
            break;
          }
        }
        
        if (warningStreak >= 3) {
          alerts.push({
            priority: 'medium',
            message: `WARNING: HRV below baseline for ${warningStreak} consecutive days`,
            recommendation: 'Consider reducing Allimax dose. Focus on recovery and stress management.',
            type: 'hrv',
            icon: '🟡'
          });
        }
      }
      
      // Check for OPTIMAL: HRV > 80ms sustained
      const recentHighHRV = sortedVitals.slice(0, 3).filter(v => v.hrv > 80).length;
      if (recentHighHRV >= 3) {
        alerts.push({
          priority: 'low',
          message: 'OPTIMAL: HRV consistently above 80ms',
          recommendation: 'Excellent recovery capacity. Protocol is working well.',
          type: 'hrv',
          icon: '🟢'
        });
      }
    }
  }
  
  // ========== SLEEP ALERTS ==========
  if (sleep && sleep.length > 0) {
    // Sort by date descending
    const sortedSleep = sleep
      .filter(s => s.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sortedSleep.length >= 3) {
      // Check for CRITICAL: Deep sleep < 30min for 3+ nights
      const lowDeepSleepNights = sortedSleep.filter(s => (s.deepSleepMinutes || 0) < 30);
      if (lowDeepSleepNights.length >= 3) {
        alerts.push({
          priority: 'high',
          message: `CRITICAL: Deep sleep below 30min for ${lowDeepSleepNights.length} nights`,
          recommendation: 'Reduce antimicrobials temporarily. Prioritize sleep hygiene. Consider magnesium before bed.',
          type: 'sleep',
          icon: '🔴'
        });
      }
      
      // Check for WARNING: Sleep quality < 5 for 3+ nights
      const poorQualityNights = sortedSleep.filter(s => {
        const quality = parseInt(s.quality) || 0;
        return quality > 0 && quality < 5;
      });
      if (poorQualityNights.length >= 3) {
        alerts.push({
          priority: 'medium',
          message: `WARNING: Poor sleep quality for ${poorQualityNights.length} nights`,
          recommendation: 'Review sleep environment. Consider reducing evening stress. Check for die-off symptoms.',
          type: 'sleep',
          icon: '🟡'
        });
      }
      
      // Check for WARNING: Total sleep < 5hrs for 3+ nights
      const shortSleepNights = sortedSleep.filter(s => (s.totalHours || s.hours || 0) < 5);
      if (shortSleepNights.length >= 3) {
        alerts.push({
          priority: 'medium',
          message: `WARNING: Less than 5 hours sleep for ${shortSleepNights.length} nights`,
          recommendation: 'Sleep debt accumulating. Prioritize 7-8 hours tonight. Avoid caffeine after 2pm.',
          type: 'sleep',
          icon: '🟡'
        });
      }
    }
  }
  
  // ========== PROTOCOL ALERTS ==========
  
  // Morning supplements reminder (if not logged by 10am)
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour >= 10 && currentHour < 14) {
    // Check if supplements were logged this morning
    const today = now.toISOString().split('T')[0];
    const hasLoggedSupplements = dailyLogs && dailyLogs.some(log => {
      const logDate = log.date || (log.createdAt && log.createdAt.split('T')[0]);
      return logDate === today && (log.type === 'supplement' || log.notes?.toLowerCase().includes('supplement'));
    });
    
    if (!hasLoggedSupplements) {
      alerts.push({
        priority: 'low',
        message: 'Morning supplements not yet logged',
        recommendation: 'Take Allimax (2 caps), Biofilm Defense (2 caps), and S. Boulardii before breakfast.',
        type: 'protocol',
        icon: '💊'
      });
    }
  }
  
  // Kill phase ending soon (within 7 days)
  if (protocolData && protocolData.phase) {
    const phase = protocolData.phase;
    const daysRemaining = phase.daysRemaining || phase.daysLeft;
    
    if (daysRemaining !== undefined && daysRemaining > 0 && daysRemaining <= 7) {
      alerts.push({
        priority: 'medium',
        message: `Kill phase ending in ${daysRemaining} days`,
        recommendation: 'Prepare for transition to maintenance phase. Ensure die-off symptoms are resolved.',
        type: 'protocol',
        icon: '⏰'
      });
    }
  }
  
  return alerts;
}

// Load Overview
async function loadOverview() {
  const data = await apiGet('/api/overview');
  if (!data) return;
  
  // Update stats
  document.getElementById('today-logs').textContent = data.todayStatus?.logsCount || 0;
  document.getElementById('today-supps').textContent = `${data.todayStatus?.supplementsTaken || 0}/6`;
  document.getElementById('today-symptoms').textContent = data.todayStatus?.symptomsLogged || 0;
  
  // HRV Status Card
  await loadHRVStatus();
  
  // Protocol card - Add adherence tracking
  const protocolOverview = document.getElementById('protocol-overview');
  if (protocolOverview) {
    protocolOverview.innerHTML = `
      <!-- Protocol Adherence Section -->
      <div id="next-dose-container" class="mb-4">
        <div class="bg-gray-800 rounded-lg p-4 animate-pulse">
          <div class="h-16 bg-gray-700 rounded"></div>
        </div>
      </div>
      
      <div id="protocol-adherence-container" class="mb-4">
        <div class="bg-gray-800 rounded-lg p-4 animate-pulse">
          <div class="h-32 bg-gray-700 rounded"></div>
        </div>
      </div>
      
      <div id="weekly-adherence-container" class="mb-4">
        <div class="bg-gray-800 rounded-lg p-4 animate-pulse">
          <div class="h-24 bg-gray-700 rounded"></div>
        </div>
      </div>
      
      <!-- Refresh button -->
      <button onclick="refreshProtocolAdherence()" class="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors flex items-center justify-center gap-2">
        <span>🔄</span> Refresh Protocol Status
      </button>
    `;
    
    // Trigger adherence load after DOM update
    setTimeout(loadProtocolAdherence, 100);
  }
  
  // Alerts - Merge server alerts with automated trend-based alerts
  const alertsList = document.getElementById('alerts-list');
  
  // Get automated alerts from trend analysis
  const automatedAlerts = await checkAlerts();
  
  // Merge with server alerts
  const allAlerts = [
    ...automatedAlerts,
    ...(data.alerts || [])
  ];
  
  // Sort by priority (high -> medium -> low)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  allAlerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  if (allAlerts.length > 0) {
    alertsList.innerHTML = allAlerts.map(a => `
      <div class="flex items-center gap-3 p-3 ${a.dismissed ? 'bg-gray-800 opacity-50' : 'bg-gray-800'} rounded-lg border-l-4 ${
        a.priority === 'high' ? 'border-accent-red' : 
        a.priority === 'medium' ? 'border-accent-yellow' : 
        'border-accent-green'
      }">
        <span class="text-lg">${a.icon || (a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢')}</span>
        <div class="flex-1">
          <div class="text-sm font-medium">${a.message}</div>
          ${a.recommendation ? `<div class="text-xs text-gray-400 mt-1">${a.recommendation}</div>` : ''}
          ${a.details ? `<div class="text-xs text-gray-400">${a.details}</div>` : ''}
        </div>
      </div>
    `).join('');
  } else {
    alertsList.innerHTML = `
      <div class="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border-l-4 border-accent-green">
        <span class="text-lg">✅</span>
        <div class="text-sm text-gray-300">No active alerts - all systems normal</div>
      </div>
    `;
  }
}

// Load HRV Status for Overview - UPDATED FOR APPLE HEALTH WITH DEBUG LOGGING
async function loadHRVStatus() {
  console.log('=== DEBUG: loadHRVStatus() START ===');
  console.log('API_BASE URL:', API_BASE);
  
  // Check DOM elements exist before using them
  const hrvCurrentEl = document.getElementById('hrv-current');
  const hrvStatusEl = document.getElementById('hrv-status');
  const hrvRecommendationEl = document.getElementById('hrv-recommendation');
  const hrvTrendEl = document.getElementById('hrv-trend');
  const hrvCardEl = document.getElementById('hrv-status-card');
  const hrvDeepSleepEl = document.getElementById('hrv-deep-sleep');
  
  console.log('DOM Elements found:', {
    'hrv-current': !!hrvCurrentEl,
    'hrv-status': !!hrvStatusEl,
    'hrv-recommendation': !!hrvRecommendationEl,
    'hrv-trend': !!hrvTrendEl,
    'hrv-status-card': !!hrvCardEl,
    'hrv-deep-sleep': !!hrvDeepSleepEl
  });
  
  try {
    // TEST: Hardcoded value to verify display works
    console.log('DEBUG: Testing with hardcoded value first...');
    if (hrvCurrentEl) {
      const testValue = '70.43ms (TEST)';
      console.log('DEBUG: Setting hardcoded value:', testValue);
      hrvCurrentEl.textContent = testValue;
      hrvCurrentEl.className = 'text-3xl font-bold text-accent-green';
    }
    
    // Fetch from /api/vitals where Apple Health data is stored
    console.log('DEBUG: Fetching from /api/vitals...');
    let vitals = await apiGet('/api/vitals');
    console.log('DEBUG: Raw API Response:', vitals);
    console.log('DEBUG: Vitals data type:', typeof vitals);
    console.log('DEBUG: Vitals is array:', Array.isArray(vitals));
    console.log('DEBUG: Vitals length:', vitals?.length);
    
    if (vitals && Array.isArray(vitals)) {
      console.log('DEBUG: First vital record:', vitals[0]);
      console.log('DEBUG: Last vital record:', vitals[vitals.length - 1]);
    }
    
    // Parse string values to numbers (API returns strings like "44.35")
    if (vitals && Array.isArray(vitals)) {
      console.log('DEBUG: Parsing vitals to numbers...');
      vitals = vitals.map((v, idx) => {
        const parsed = {
          ...v,
          hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null,
          rhr: v.rhr !== null && v.rhr !== undefined ? parseFloat(v.rhr) : null
        };
        if (idx < 3) console.log(`DEBUG: Parsed vital[${idx}]:`, { original: v.hrv, parsed: parsed.hrv });
        return parsed;
      });
      console.log('DEBUG: Parsed vitals count:', vitals.length);
    }
    
    if (!vitals || vitals.length === 0) {
      console.log('DEBUG: No vitals data found after parsing');
      if (hrvCurrentEl) hrvCurrentEl.textContent = '--';
      if (hrvStatusEl) hrvStatusEl.textContent = 'No data';
      if (hrvRecommendationEl) hrvRecommendationEl.textContent = 'Log your HRV to see recommendations';
      console.log('=== DEBUG: loadHRVStatus() END (no data) ===');
      return;
    }
    
    // Sort by date descending and get latest HRV entry
    console.log('DEBUG: Sorting vitals by date...');
    const sortedVitals = vitals.sort((a, b) => new Date(b.date) - new Date(a.date));
    console.log('DEBUG: Sorted vitals first 3:', sortedVitals.slice(0, 3).map(v => ({ date: v.date, hrv: v.hrv })));
    
    const latestVital = sortedVitals.find(v => {
      const hasHRV = v.hrv !== null && v.hrv !== undefined && !isNaN(v.hrv);
      if (hasHRV) console.log('DEBUG: Found latest vital with HRV:', v);
      return hasHRV;
    });
    
    console.log('DEBUG: Latest vital with HRV:', latestVital);
    
    if (!latestVital) {
      console.log('DEBUG: No HRV data found in any vitals record');
      console.log('DEBUG: Sample vitals HRV values:', sortedVitals.slice(0, 5).map(v => ({ date: v.date, hrv: v.hrv, type: typeof v.hrv })));
      if (hrvCurrentEl) hrvCurrentEl.textContent = '--';
      if (hrvStatusEl) hrvStatusEl.textContent = 'No HRV data in records';
      if (hrvRecommendationEl) hrvRecommendationEl.textContent = 'Log your HRV to see recommendations';
      console.log('=== DEBUG: loadHRVStatus() END (no HRV in records) ===');
      return;
    }
    
    const hrv = latestVital.hrv;
    const baseline = 61; // Your baseline HRV
    const diff = hrv - baseline;
    const diffPercent = ((diff / baseline) * 100).toFixed(0);
    
    console.log(`DEBUG: DISPLAYING HRV - Value: ${hrv}ms, Baseline: ${baseline}ms, Diff: ${diff}ms`);
    
    // Update HRV display
    if (hrvCurrentEl) {
      const displayValue = `${hrv}ms`;
      console.log('DEBUG: Setting hrv-current to:', displayValue);
      hrvCurrentEl.textContent = displayValue;
    } else {
      console.error('DEBUG: hrv-current element NOT FOUND!');
    }
    
    if (hrvTrendEl) {
      const trendText = `${diff >= 0 ? '+' : ''}${diff}ms (${diffPercent}%) vs baseline`;
      console.log('DEBUG: Setting hrv-trend to:', trendText);
      hrvTrendEl.textContent = trendText;
    }
    
    // Color code
    if (hrvCurrentEl) {
      if (diff < -10) {
        hrvCurrentEl.className = 'text-3xl font-bold text-accent-red';
      } else if (diff < 0) {
        hrvCurrentEl.className = 'text-3xl font-bold text-accent-yellow';
      } else {
        hrvCurrentEl.className = 'text-3xl font-bold text-accent-green';
      }
      console.log('DEBUG: Applied color class:', hrvCurrentEl.className);
    }
    
    // Status and recommendation
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
    
    console.log('DEBUG: Status:', status);
    console.log('DEBUG: Recommendation:', recommendation);
    
    if (hrvStatusEl) {
      hrvStatusEl.textContent = status;
      console.log('DEBUG: Set hrv-status');
    }
    if (hrvRecommendationEl) {
      hrvRecommendationEl.textContent = recommendation;
      console.log('DEBUG: Set hrv-recommendation');
    }
    
    // Update card border
    if (hrvCardEl) {
      hrvCardEl.className = `card p-6 mb-6 border-l-4 ${cardBorder}`;
      console.log('DEBUG: Set hrv-status-card class');
    }
    
    // Fetch latest sleep data for deep sleep info
    console.log('DEBUG: Fetching sleep data...');
    const sleepData = await apiGet('/api/sleep');
    console.log('DEBUG: Sleep data:', sleepData?.length, 'records');
    
    if (sleepData && sleepData.length > 0) {
      const latestSleep = sleepData.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const deepSleepMin = latestSleep?.deepSleepMin || latestSleep?.deepSleepMinutes || 0;
      console.log('DEBUG: Deep sleep minutes:', deepSleepMin);
      if (deepSleepMin && hrvDeepSleepEl) {
        hrvDeepSleepEl.textContent = `Deep sleep: ${deepSleepMin}min`;
      }
    }
    
    console.log('=== DEBUG: loadHRVStatus() END SUCCESS ===');
    
  } catch (error) {
    console.error('DEBUG: ERROR in loadHRVStatus:', error);
    console.error('DEBUG: Error stack:', error.stack);
    if (hrvStatusEl) hrvStatusEl.textContent = 'Error loading data';
    console.log('=== DEBUG: loadHRVStatus() END WITH ERROR ===');
  }
}

// Enhanced Protocol Schedule with exact timing
const ENHANCED_PROTOCOL_SCHEDULE = {
  morning: {
    label: 'Morning (Empty Stomach)',
    time: '07:00',
    timingNote: '30 min before breakfast',
    supplements: [
      { name: 'Allimax', dosage: '450mg', count: 2, purpose: 'Antimicrobial (allicin)' },
      { name: 'Neem', dosage: '500mg', count: 2, purpose: 'Antimicrobial' }
    ]
  },
  breakfast: {
    label: 'With Breakfast',
    time: '08:00',
    timingNote: 'Take with food',
    supplements: [
      { name: 'Biofilm Defense', dosage: '2 caps', count: 1, purpose: 'Biofilm disruptor' }
    ]
  },
  lunch: {
    label: 'Lunch',
    time: '12:00',
    timingNote: 'With meal',
    supplements: [
      { name: 'Allimax', dosage: '450mg', count: 2, purpose: 'Antimicrobial' },
      { name: 'S. Boulardii', dosage: '250mg', count: 1, purpose: 'Probiotic' }
    ]
  },
  dinner: {
    label: 'Dinner',
    time: '18:00',
    timingNote: 'With meal',
    supplements: [
      { name: 'Allimax', dosage: '450mg', count: 2, purpose: 'Antimicrobial' }
    ]
  },
  evening: {
    label: 'Evening',
    time: '21:00',
    timingNote: '3-4 hours after dinner',
    supplements: [
      { name: 'MotilPro', dosage: '2 caps', count: 1, purpose: 'Prokinetic (artichoke + ginger)' }
    ]
  },
  bedtime: {
    label: 'Bedtime',
    time: '22:00',
    timingNote: 'Before sleep',
    supplements: [
      { name: 'Allimax', dosage: '450mg', count: 2, purpose: 'Antimicrobial' }
    ]
  }
};

// 16-Week Protocol Phases
const PROTOCOL_PHASES = [
  { week: 1, name: 'High-Dose Kill', duration: 4, color: 'accent-red', description: 'Maximum antimicrobial dosing' },
  { week: 5, name: 'Maintenance Kill', duration: 4, color: 'accent-yellow', description: 'Sustained antimicrobial pressure' },
  { week: 9, name: 'Biofilm Disruption', duration: 3, color: 'accent-blue', description: 'Focus on biofilm disruption' },
  { week: 12, name: 'Recovery Phase', duration: 3, color: 'accent-green', description: 'Support healing and motility' },
  { week: 15, name: 'Transition', duration: 2, color: 'primary-500', description: 'Prepare for maintenance' }
];

// Total doses per day
const TOTAL_DAILY_SUPPLEMENTS = Object.values(ENHANCED_PROTOCOL_SCHEDULE)
  .reduce((sum, slot) => sum + slot.supplements.reduce((s, supp) => s + supp.count, 0), 0);

// Store adherence logs
let protocolAdherenceLogs = [];

// Render Protocol Tab - Fully Enhanced
function renderProtocol() {
  if (!protocolData) return;
  
  // Calculate protocol metrics
  const startDate = protocolData.startDate ? new Date(protocolData.startDate) : new Date('2026-01-20');
  const today = new Date();
  const dayDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.max(1, dayDiff);
  const totalDays = 112; // 16 weeks
  const daysRemaining = Math.max(0, totalDays - currentDay);
  const progress = Math.min(100, Math.round((currentDay / totalDays) * 100));
  
  // Calculate completion date
  const completionDate = new Date(startDate);
  completionDate.setDate(completionDate.getDate() + totalDays);
  
  // Update phase info
  const currentPhase = PROTOCOL_PHASES.find(p => 
    currentDay >= ((p.week - 1) * 7) && currentDay <= (p.week * 7 + p.duration * 7)
  ) || PROTOCOL_PHASES[0];
  
  document.getElementById('protocol-phase-name').textContent = currentPhase.name;
  document.getElementById('protocol-phase-dates').textContent = 
    `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${completionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  document.getElementById('phase-progress').textContent = `${progress}%`;
  document.getElementById('phase-day-counter').textContent = `Day ${currentDay} of ${totalDays}`;
  document.getElementById('phase-progress-bar').style.width = `${progress}%`;
  
  // Update stats
  document.getElementById('days-remaining').textContent = daysRemaining;
  document.getElementById('completion-date').textContent = completionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  // Calculate and display streak
  calculateAndDisplayStreak();
  
  // Render the 16-week timeline
  renderProtocolTimeline(currentDay, totalDays);
  
  // Render supplement schedule with checkboxes
  renderSupplementSchedule();
  
  // Render adherence tracking
  renderProtocolAdherenceTracking();
  
  // Legacy schedule timeline
  renderLegacyScheduleTimeline();
  
  // Supplements list
  renderSupplementsList();
}

// Calculate and display protocol streak
function calculateAndDisplayStreak() {
  const streakEl = document.getElementById('protocol-streak');
  const allTimeStreakEl = document.getElementById('all-time-streak');
  
  // Get streak from localStorage or calculate from logs
  let streak = parseInt(localStorage.getItem('protocolStreak') || '18');
  
  if (streakEl) streakEl.textContent = `🔥 ${streak} days`;
  if (allTimeStreakEl) allTimeStreakEl.textContent = `${streak} days`;
}

// Render 16-Week Protocol Timeline
function renderProtocolTimeline(currentDay, totalDays) {
  const container = document.getElementById('protocol-timeline');
  if (!container) return;
  
  let html = '<div class="relative">';
  
  // Progress bar background
  html += `
    <div class="absolute top-6 left-0 right-0 h-2 bg-gray-700 rounded-full"></div>
    <div class="absolute top-6 left-0 h-2 bg-gradient-to-r from-accent-red via-accent-yellow to-accent-green rounded-full transition-all duration-500" style="width: ${(currentDay / totalDays) * 100}%"></div>
  `;
  
  // Phase markers
  html += '<div class="relative flex justify-between pt-0">';
  
  PROTOCOL_PHASES.forEach((phase, idx) => {
    const startDay = (phase.week - 1) * 7;
    const endDay = startDay + (phase.duration * 7);
    const isActive = currentDay >= startDay && currentDay < endDay;
    const isCompleted = currentDay >= endDay;
    const position = (startDay / totalDays) * 100;
    
    const colorClass = phase.color.replace('accent-', 'text-').replace('primary-', 'text-primary-');
    const bgClass = phase.color.replace('accent-', 'bg-').replace('primary-', 'bg-primary-');
    
    html += `
      <div class="flex flex-col items-center" style="width: ${100 / PROTOCOL_PHASES.length}%"
           title="${phase.description}"
      >
        <div class="text-xs text-gray-400 mb-1">W${phase.week}</div>
        <div class="w-4 h-4 rounded-full border-2 ${isActive ? `${bgClass} border-white ring-2 ring-${bgClass} ring-opacity-50 animate-pulse` : isCompleted ? bgClass : 'bg-gray-800 border-gray-600'} z-10 transition-all"></div>
        <div class="text-xs mt-2 text-center ${isActive ? colorClass : 'text-gray-500'}">
          ${phase.name}
        </div>
        ${isActive ? `<div class="text-xs text-gray-400">${currentDay - startDay}d in</div>` : ''}
      </div>
    `;
  });
  
  html += '</div>';
  
  // Current position indicator
  const currentPosition = (currentDay / totalDays) * 100;
  html += `
    <div class="absolute top-4" style="left: ${Math.min(95, currentPosition)}%">
      <div class="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white transform -translate-x-1/2"></div>
      <div class="text-xs text-white text-center -mt-1 -ml-1">You</div>
    </div>
  `;
  
  html += '</div>';
  container.innerHTML = html;
}

// Render Daily Supplement Schedule with Checkboxes
function renderSupplementSchedule() {
  const container = document.getElementById('supplement-schedule');
  if (!container) return;
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  let html = '';
  let takenCount = 0;
  let totalCount = 0;
  
  Object.entries(ENHANCED_PROTOCOL_SCHEDULE).forEach(([key, slot]) => {
    const [slotHour, slotMin] = slot.time.split(':').map(Number);
    const slotTimeMinutes = slotHour * 60 + slotMin;
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    // Determine slot status
    const isPast = currentTimeMinutes > slotTimeMinutes + 120; // 2hr grace period
    const isCurrent = Math.abs(currentTimeMinutes - slotTimeMinutes) <= 60;
    const isFuture = currentTimeMinutes < slotTimeMinutes - 60;
    
    // Check if supplements are taken
    const slotSupplements = slot.supplements.map(supp => {
      totalCount += supp.count;
      const logKey = `${key}_${supp.name}`;
      const isTaken = localStorage.getItem(logKey) === new Date().toISOString().split('T')[0];
      if (isTaken) takenCount += supp.count;
      
      return { ...supp, isTaken, logKey };
    });
    
    const allTaken = slotSupplements.every(s => s.isTaken);
    const someTaken = slotSupplements.some(s => s.isTaken) && !allTaken;
    
    // Status styling
    let borderClass = 'border-l-4 border-gray-600';
    let bgClass = 'bg-gray-800';
    let statusBadge = '';
    
    if (isCurrent) {
      borderClass = 'border-l-4 border-blue-500';
      bgClass = 'bg-gray-700';
      statusBadge = '<span class="text-xs bg-blue-600 px-2 py-0.5 rounded-full text-white animate-pulse">NOW</span>';
    } else if (allTaken) {
      borderClass = 'border-l-4 border-green-500';
      statusBadge = '<span class="text-xs bg-green-600 px-2 py-0.5 rounded-full text-white">✓ Done</span>';
    } else if (isPast && !allTaken) {
      borderClass = 'border-l-4 border-red-500';
      bgClass = 'bg-gray-800 opacity-75';
      statusBadge = '<span class="text-xs bg-red-600 px-2 py-0.5 rounded-full text-white">Missed</span>';
    }
    
    html += `
      <div class="${bgClass} ${borderClass} rounded-lg p-4 transition-all hover:bg-gray-750">
        <div class="flex justify-between items-start mb-3">
          <div class="flex items-center gap-3">
            <div class="text-2xl">${getTimeSlotIcon(key)}</div>
            <div>
              <div class="font-medium text-white">${slot.label}</div>
              <div class="text-xs text-gray-400">${slot.time} • ${slot.timingNote}</div>
            </div>
          </div>
          ${statusBadge}
        </div>
        
        <div class="space-y-2 ml-11">
          ${slotSupplements.map(supp => `
            <label class="flex items-center gap-3 cursor-pointer hover:bg-gray-700 rounded p-2 transition-colors">
              <input type="checkbox" 
                     class="w-5 h-5 rounded border-gray-600 text-accent-green focus:ring-accent-green bg-gray-700"
                     ${supp.isTaken ? 'checked' : ''}
                     onchange="toggleSupplement('${supp.logKey}', ${supp.count})"
                     ${isPast && !supp.isTaken ? 'disabled' : ''}
              >
              <div class="flex-1">
                <span class="text-sm ${supp.isTaken ? 'text-gray-400 line-through' : 'text-white'}">${supp.name}</span>
                <span class="text-xs text-gray-500 ml-2">${supp.dosage}</span>
              </div>
              <span class="text-xs text-gray-500">×${supp.count}</span>
              ${supp.isTaken ? '<span class="text-green-500">✓</span>' : ''}
            </label>
          `).join('')}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Update adherence rate
  const adherenceRate = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;
  const rateEl = document.getElementById('today-adherence-rate');
  if (rateEl) {
    rateEl.textContent = `${adherenceRate}% taken today`;
    rateEl.className = `text-sm font-normal ml-auto ${adherenceRate >= 80 ? 'text-green-400' : adherenceRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`;
  }
  
  // Update quick stats
  updateQuickStats(takenCount, totalCount);
}

// Get icon for time slot
function getTimeSlotIcon(slotKey) {
  const icons = {
    morning: '🌅',
    breakfast: '🍳',
    lunch: '🥩',
    dinner: '🍽️',
    evening: '🌆',
    bedtime: '😴'
  };
  return icons[slotKey] || '💊';
}

// Toggle supplement taken status
function toggleSupplement(logKey, count) {
  const today = new Date().toISOString().split('T')[0];
  const currentValue = localStorage.getItem(logKey);
  
  if (currentValue === today) {
    // Untake
    localStorage.removeItem(logKey);
  } else {
    // Take
    localStorage.setItem(logKey, today);
  }
  
  // Refresh display
  renderSupplementSchedule();
  renderProtocolAdherenceTracking();
  
  // Update streak if all taken
  checkAndUpdateStreak();
}

// Check if all supplements taken and update streak
function checkAndUpdateStreak() {
  const today = new Date().toISOString().split('T')[0];
  let allTaken = true;
  let totalDoses = 0;
  let takenDoses = 0;
  
  Object.entries(ENHANCED_PROTOCOL_SCHEDULE).forEach(([key, slot]) => {
    slot.supplements.forEach(supp => {
      totalDoses += supp.count;
      const logKey = `${key}_${supp.name}`;
      if (localStorage.getItem(logKey) === today) {
        takenDoses += supp.count;
      } else {
        allTaken = false;
      }
    });
  });
  
  // If 80%+ taken, count as a streak day
  const adherenceRate = totalDoses > 0 ? (takenDoses / totalDoses) : 0;
  if (adherenceRate >= 0.8) {
    let streak = parseInt(localStorage.getItem('protocolStreak') || '0');
    const lastStreakDate = localStorage.getItem('lastStreakDate');
    
    if (lastStreakDate !== today) {
      streak++;
      localStorage.setItem('protocolStreak', streak.toString());
      localStorage.setItem('lastStreakDate', today);
      
      // Update streak display
      const streakEl = document.getElementById('protocol-streak');
      const allTimeStreakEl = document.getElementById('all-time-streak');
      if (streakEl) streakEl.textContent = `🔥 ${streak} days`;
      if (allTimeStreakEl) allTimeStreakEl.textContent = `${streak} days`;
      
      showToast(`🔥 Streak continued! ${streak} days`);
    }
  }
}

// Update quick stats
function updateQuickStats(taken, total) {
  const missed = total - taken;
  const pending = Math.max(0, total - taken);
  
  const takenEl = document.getElementById('taken-today');
  const missedEl = document.getElementById('missed-today');
  const pendingEl = document.getElementById('pending-today');
  
  if (takenEl) takenEl.textContent = taken;
  if (missedEl) missedEl.textContent = missed;
  if (pendingEl) pendingEl.textContent = pending;
}

// Render Protocol Adherence Tracking
function renderProtocolAdherenceTracking() {
  renderWeeklyAdherenceDots();
  updateWeeklyAdherenceRate();
}

// Render weekly adherence dots
function renderWeeklyAdherenceDots() {
  const container = document.getElementById('weekly-adherence-dots');
  if (!container) return;
  
  const today = new Date();
  let html = '';
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'narrow' });
    
    // Calculate adherence for this day
    let taken = 0;
    let total = 0;
    
    Object.entries(ENHANCED_PROTOCOL_SCHEDULE).forEach(([key, slot]) => {
      slot.supplements.forEach(supp => {
        total += supp.count;
        const logKey = `${key}_${supp.name}`;
        if (localStorage.getItem(`${logKey}_${dateStr}`)) {
          taken += supp.count;
        }
      });
    });
    
    const rate = total > 0 ? (taken / total) : 0;
    let dotClass = 'bg-gray-700';
    if (rate >= 0.8) dotClass = 'bg-green-500';
    else if (rate >= 0.5) dotClass = 'bg-yellow-500';
    else if (rate > 0) dotClass = 'bg-red-500';
    
    html += `
      <div class="flex flex-col items-center flex-1">
        <div class="w-4 h-4 rounded-full ${dotClass} mb-1" title="${dayName}: ${Math.round(rate * 100)}%"></div>
        <span class="text-xs text-gray-500">${dayName}</span>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

// Update weekly adherence rate
function updateWeeklyAdherenceRate() {
  const rateEl = document.getElementById('weekly-adherence-rate');
  const barEl = document.getElementById('weekly-adherence-bar');
  
  if (!rateEl || !barEl) return;
  
  // Calculate 7-day average
  const today = new Date();
  let totalTaken = 0;
  let totalExpected = 0;
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    Object.entries(ENHANCED_PROTOCOL_SCHEDULE).forEach(([key, slot]) => {
      slot.supplements.forEach(supp => {
        totalExpected += supp.count;
        const logKey = `${key}_${supp.name}`;
        if (localStorage.getItem(`${logKey}_${dateStr}`)) {
          totalTaken += supp.count;
        }
      });
    });
  }
  
  const rate = totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 0;
  
  rateEl.textContent = `${rate}%`;
  rateEl.className = `text-2xl font-bold ${rate >= 80 ? 'text-green-400' : rate >= 60 ? 'text-yellow-400' : 'text-red-400'}`;
  
  barEl.style.width = `${rate}%`;
  barEl.className = `h-3 rounded-full transition-all ${rate >= 80 ? 'bg-green-500' : rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`;
}

// Render Legacy Schedule Timeline
function renderLegacyScheduleTimeline() {
  const scheduleTimeline = document.getElementById('schedule-timeline');
  if (!scheduleTimeline || !protocolData) return;
  
  const scheduleOrder = ['morning_empty_stomach', 'breakfast', 'lunch', 'dinner', 'bedtime'];
  const scheduleLabels = {
    morning_empty_stomach: 'Morning (Empty Stomach)',
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    bedtime: 'Bedtime'
  };
  const scheduleTimes = {
    morning_empty_stomach: '~7:00 AM',
    breakfast: '~8:00 AM',
    lunch: '~12:00 PM',
    dinner: '~6:00 PM',
    bedtime: '~10:00 PM'
  };
  
  scheduleTimeline.innerHTML = scheduleOrder.map(key => {
    const supplements = protocolData.schedule?.[key] || [];
    return `
      <div class="flex gap-4">
        <div class="flex flex-col items-center">
          <div class="timeline-dot ${supplements.length > 0 ? 'bg-accent-green' : 'bg-gray-600'}"></div>
          <div class="w-0.5 h-full bg-gray-700"></div>
        </div>
        <div class="pb-6 flex-1">
          <div class="font-medium">${scheduleLabels[key]}</div>
          <div class="text-xs text-gray-400">${scheduleTimes[key]}</div>
          ${supplements.length > 0 ? `
            <div class="mt-2 space-y-1">
              ${supplements.map(s => `
                <div class="inline-block px-2 py-1 bg-primary-600 rounded text-xs mr-2">${s.name}</div>
              `).join('')}
            </div>
          ` : '<div class="text-xs text-gray-500 mt-1">No supplements</div>'}
        </div>
      </div>
    `;
  }).join('');
}

// Render Supplements List
function renderSupplementsList() {
  const supplementsList = document.getElementById('supplements-list');
  if (!supplementsList || !protocolData) return;
  
  supplementsList.innerHTML = protocolData.supplements?.map(s => `
    <div class="p-3 bg-gray-800 rounded-lg">
      <div class="flex justify-between items-start">
        <div class="font-medium">${s.name}</div>
        <span class="text-xs px-2 py-0.5 ${s.active ? 'bg-accent-green text-black' : 'bg-gray-600'} rounded">
          ${s.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div class="text-sm text-gray-400 mt-1">${s.dosage}</div>
      <div class="text-xs text-gray-500 mt-1">${s.timing.join(', ')} • ${s.withFood ? 'With food' : 'Empty stomach'}</div>
      ${s.purpose ? `<div class="text-xs text-primary-400 mt-1">${s.purpose}</div>` : ''}
    </div>
  `).join('') || '<p class="text-gray-400">No supplements configured</p>';
}

// Render adherence tracking in the Protocol tab
async function renderProtocolTabAdherence() {
  // Ensure adherence data is loaded
  if (!adherenceData) {
    await loadProtocolAdherence();
    return;
  }
  
  const nextDoseContainer = document.getElementById('protocol-tab-next-dose');
  const checklistContainer = document.getElementById('protocol-tab-adherence-checklist');
  const weeklyContainer = document.getElementById('protocol-tab-weekly-adherence');
  
  if (nextDoseContainer) {
    const nextDose = getNextDose();
    if (nextDose) {
      const suppNames = nextDose.supplements.map(s => s.name).join(', ');
      const timeText = nextDose.hours > 0 
        ? `${nextDose.hours}h ${nextDose.minutes}m` 
        : `${nextDose.minutes}m`;
      
      nextDoseContainer.innerHTML = `
        <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4 mb-4 border border-blue-700">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm text-blue-300">Next Dose</div>
              <div class="text-lg font-bold">${suppNames}</div>
              <div class="text-sm text-gray-400">${nextDose.label}</div>
            </div>
            <div class="text-right">
              <div class="text-3xl font-mono font-bold text-blue-400">in ${timeText}</div>
              <div class="text-xs text-gray-500">${nextDose.timeStr}</div>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  if (checklistContainer) {
    const currentSlot = getCurrentTimeSlot();
    
    let html = '<div class="bg-gray-800 rounded-lg p-4 mb-4"><div class="space-y-3">';
    
    Object.entries(PROTOCOL_SCHEDULE).forEach(([key, slot]) => {
      const isCurrent = key === currentSlot;
      const isPassed = hasTimeSlotPassed(key);
      const slotClass = isCurrent ? 'border-l-4 border-blue-500 bg-gray-700' : 
                        isPassed ? 'opacity-60' : '';
      
      html += `
        <div class="p-3 rounded-lg ${slotClass}">
          <div class="flex justify-between items-center mb-2">
            <span class="font-medium text-sm">${slot.label}</span>
            <span class="text-xs text-gray-500">${slot.time}</span>
          </div>
          <div class="space-y-1">
      `;
      
      slot.supplements.forEach(supp => {
        const status = getSupplementStatus(key, supp.name);
        html += `
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="${status.class}">${status.icon}</span>
              <span class="text-sm ${status.class}">${supp.name}</span>
            </div>
            ${status.status === 'pending' && !isPassed ? `
              <button onclick="quickLogSupplement('${key}', '${supp.name}')" 
                      class="text-xs bg-accent-green text-black px-2 py-1 rounded hover:bg-green-400 transition-colors">
                Log
              </button>
            ` : `<span class="text-xs text-gray-500">${status.status}</span>
            `}
          </div>
        `;
      });
      
      html += '</div></div>';
    });
    
    html += '</div></div>';
    checklistContainer.innerHTML = html;
  }
  
  if (weeklyContainer) {
    // Use the same weekly adherence calculation
    await renderWeeklyAdherence();
    // Move the weekly container content here
    const mainWeekly = document.getElementById('weekly-adherence-container');
    if (mainWeekly) {
      weeklyContainer.innerHTML = mainWeekly.innerHTML;
    }
  }
}

// Load Symptoms
async function loadSymptoms() {
  console.log('=== DEBUG: loadSymptoms() START ===');
  
  try {
    // Fetch symptoms and vitals in parallel for correlation
    const [symptoms, vitals] = await Promise.all([
      apiGet('/api/symptoms'),
      apiGet('/api/vitals')
    ]);
    
    console.log('DEBUG: Symptoms data:', symptoms?.length, 'records');
    console.log('DEBUG: Vitals data:', vitals?.length, 'records');
    
    // Parse vitals HRV values
    let parsedVitals = [];
    if (vitals && Array.isArray(vitals)) {
      parsedVitals = vitals.map(v => ({
        ...v,
        hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null,
        date: v.date || (v.created_at ? v.created_at.split('T')[0] : null)
      })).filter(v => v.hrv !== null && !isNaN(v.hrv));
    }
    
    // Store globally for filtering
    window.allSymptoms = symptoms || [];
    window.vitalsData = parsedVitals;
    
    // Get current filter
    const filterType = document.getElementById('symptom-filter')?.value || 'all';
    
    // Filter symptoms
    let filteredSymptoms = window.allSymptoms;
    if (filterType !== 'all') {
      filteredSymptoms = window.allSymptoms.filter(s => s.type === filterType);
    }
    
    // Render components
    renderSymptomsList(filteredSymptoms, parsedVitals);
    renderSymptomsChart(window.allSymptoms, filterType);
    renderBloatingChart(window.allSymptoms, parsedVitals);
    renderSymptomFrequency(window.allSymptoms);
    renderCorrelations(window.allSymptoms, parsedVitals);
    
    console.log('=== DEBUG: loadSymptoms() END ===');
  } catch (err) {
    console.error('DEBUG: loadSymptoms() ERROR:', err);
    const list = document.getElementById('recent-symptoms-list');
    if (list) {
      list.innerHTML = '<p class="text-red-400">Error loading symptoms</p>';
    }
  }
}

// Filter symptoms by type
function filterSymptoms() {
  loadSymptoms();
}

// Render symptoms list with HRV correlation
function renderSymptomsList(symptoms, vitals) {
  const list = document.getElementById('recent-symptoms-list');
  if (!list) return;
  
  if (symptoms.length === 0) {
    list.innerHTML = '<p class="text-gray-400">No symptoms logged yet</p>';
    return;
  }
  
  // Sort by date descending
  const sortedSymptoms = [...symptoms].sort((a, b) => 
    new Date(b.created_at || b.date) - new Date(a.created_at || a.date)
  );
  
  list.innerHTML = sortedSymptoms.slice(0, 20).map(s => {
    const date = new Date(s.created_at || s.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = s.time || date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    // Find HRV for this date
    const symptomDate = (s.date || s.created_at?.split('T')[0]);
    const matchingVital = vitals.find(v => v.date === symptomDate);
    const hrvValue = matchingVital ? matchingVital.hrv : null;
    
    const severityColor = s.severity >= 7 ? 'text-accent-red' : 
                          s.severity >= 4 ? 'text-accent-yellow' : 'text-accent-green';
    const severityBg = s.severity >= 7 ? 'bg-red-900 bg-opacity-30 border-red-700' : 
                       s.severity >= 4 ? 'bg-yellow-900 bg-opacity-30 border-yellow-700' : 
                       'bg-green-900 bg-opacity-30 border-green-700';
    
    return `
      <div class="flex items-center justify-between p-3 bg-gray-800 rounded-lg ${severityBg} border">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="font-medium capitalize">${s.type.replace(/_/g, ' ')}</span>
            ${s.time ? `<span class="text-xs text-gray-500">at ${s.time}</span>` : ''}
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-400 mt-1">
            <span>${dateStr}</span>
            ${hrvValue ? `<span class="text-primary-400">💓 HRV: ${Math.round(hrvValue)}ms</span>` : ''}
          </div>
          ${s.notes ? `<p class="text-xs text-gray-500 mt-1">${s.notes}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-1">
            <span class="text-2xl font-bold ${severityColor}">${s.severity}</span>
            <span class="text-xs text-gray-500">/10</span>
          </div>
          ${hrvValue ? `
            <span class="text-xs ${hrvValue < 51 ? 'text-red-400' : hrvValue < 61 ? 'text-yellow-400' : 'text-green-400'}">
              HRV ${hrvValue < 51 ? '🔴' : hrvValue < 61 ? '🟡' : '🟢'}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Render main symptoms chart with optional filtering
function renderSymptomsChart(symptoms, filterType = 'all') {
  const ctx = document.getElementById('symptoms-chart');
  if (!ctx) return;
  
  if (charts.symptoms) {
    charts.symptoms.destroy();
    charts.symptoms = null;
  }
  
  if (!symptoms || symptoms.length === 0) {
    return;
  }
  
  // Filter by type if specified
  let filteredData = symptoms;
  if (filterType !== 'all') {
    filteredData = symptoms.filter(s => s.type === filterType);
  }
  
  // Group by date and type
  const dataByType = {};
  filteredData.forEach(s => {
    const date = s.date || (s.created_at ? s.created_at.split('T')[0] : null);
    if (!date) return;
    
    if (!dataByType[s.type]) dataByType[s.type] = {};
    if (!dataByType[s.type][date]) dataByType[s.type][date] = [];
    dataByType[s.type][date].push(s.severity);
  });
  
  // Get all unique dates
  const allDates = [...new Set(filteredData.map(s => s.date || (s.created_at ? s.created_at.split('T')[0] : null)))].filter(Boolean).sort();
  const last30Days = allDates.slice(-30);
  
  // Create datasets
  const colors = {
    bloating: '#f59e0b',
    histamine_reaction: '#ef4444',
    brain_fog: '#8b5cf6',
    fatigue: '#6366f1',
    nausea: '#10b981',
    cramping: '#ec4899',
    gas: '#06b6d4',
    heartburn: '#f97316',
    diarrhea: '#dc2626',
    constipation: '#78716c',
    other: '#9ca3af'
  };
  
  const datasets = Object.entries(dataByType).map(([type, dateData]) => {
    const data = last30Days.map(date => {
      const severities = dateData[date];
      if (!severities) return null;
      // Average if multiple entries per day
      return Math.round(severities.reduce((a, b) => a + b, 0) / severities.length);
    });
    
    return {
      label: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      data,
      borderColor: colors[type] || colors.other,
      backgroundColor: (colors[type] || colors.other) + '20',
      tension: 0.4,
      fill: true,
      pointRadius: 4,
      spanGaps: true
    };
  });
  
  charts.symptoms = new Chart(ctx, {
    type: 'line',
    data: {
      labels: last30Days.map(d => d.slice(5)), // MM-DD format
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          labels: { color: '#9ca3af' },
          position: 'bottom'
        },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#e5e7eb',
          bodyColor: '#e5e7eb'
        }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af' },
          title: {
            display: true,
            text: 'Severity',
            color: '#6b7280'
          }
        },
        x: {
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af', maxTicksLimit: 10 }
        }
      }
    }
  });
}

// Render bloating-specific trend chart with HRV overlay
function renderBloatingChart(symptoms, vitals) {
  const ctx = document.getElementById('bloating-chart');
  if (!ctx) return;
  
  if (charts.bloating) {
    charts.bloating.destroy();
    charts.bloating = null;
  }
  
  // Get bloating symptoms
  const bloatingData = (symptoms || [])
    .filter(s => s.type === 'bloating')
    .map(s => ({
      date: s.date || (s.created_at ? s.created_at.split('T')[0] : null),
      severity: s.severity
    }))
    .filter(s => s.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (bloatingData.length === 0) {
    // Show empty state
    return;
  }
  
  const labels = bloatingData.map(d => d.date.slice(5)); // MM-DD
  const severityData = bloatingData.map(d => d.severity);
  
  // Match HRV data
  const hrvData = bloatingData.map(d => {
    const vital = vitals.find(v => v.date === d.date);
    return vital ? vital.hrv : null;
  });
  
  charts.bloating = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Bloating Severity',
          data: severityData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: '#f59e0b',
          yAxisID: 'y'
        },
        {
          label: 'HRV (ms)',
          data: hrvData,
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f6',
          borderWidth: 0,
          pointRadius: 6,
          pointStyle: 'circle',
          showLine: false,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: { color: '#9ca3af', usePointStyle: true }
        },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#e5e7eb',
          bodyColor: '#e5e7eb',
          callbacks: {
            label: function(context) {
              if (context.dataset.label === 'Bloating Severity') {
                return `Bloating: ${context.parsed.y}/10`;
              }
              if (context.dataset.label === 'HRV (ms)') {
                return context.parsed.y ? `HRV: ${Math.round(context.parsed.y)} ms` : 'HRV: No data';
              }
              return `${context.dataset.label}: ${context.parsed.y}`;
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0,
          max: 10,
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af' },
          title: {
            display: true,
            text: 'Severity',
            color: '#f59e0b'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          min: 30,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: '#3b82f6' },
          title: {
            display: true,
            text: 'HRV (ms)',
            color: '#3b82f6'
          }
        },
        x: {
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });
}

// Render symptom frequency summary
function renderSymptomFrequency(symptoms) {
  const container = document.getElementById('symptom-frequency');
  if (!container) return;
  
  if (!symptoms || symptoms.length === 0) {
    container.innerHTML = '<p class="text-gray-400">No symptoms logged in the last 30 days</p>';
    return;
  }
  
  // Count by type (last 30 days)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  
  const counts = {};
  symptoms.forEach(s => {
    const date = new Date(s.date || s.created_at);
    if (date >= cutoffDate) {
      counts[s.type] = (counts[s.type] || 0) + 1;
    }
  });
  
  // Calculate averages
  const averages = {};
  symptoms.forEach(s => {
    const date = new Date(s.date || s.created_at);
    if (date >= cutoffDate) {
      if (!averages[s.type]) averages[s.type] = { total: 0, count: 0 };
      averages[s.type].total += s.severity;
      averages[s.type].count++;
    }
  });
  
  const sortedTypes = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  
  if (sortedTypes.length === 0) {
    container.innerHTML = '<p class="text-gray-400">No symptoms in the last 30 days</p>';
    return;
  }
  
  const typeIcons = {
    bloating: '💨',
    histamine_reaction: '🔴',
    brain_fog: '🧠',
    fatigue: '😴',
    nausea: '🤢',
    cramping: '⚡',
    gas: '💨',
    heartburn: '🔥',
    diarrhea: '💩',
    constipation: '🚫',
    other: '📋'
  };
  
  container.innerHTML = sortedTypes.map(([type, count]) => {
    const avg = averages[type] ? (averages[type].total / averages[type].count).toFixed(1) : '0';
    const icon = typeIcons[type] || '📋';
    const typeLabel = type.replace(/_/g, ' ');
    
    // Color based on average severity
    const avgSeverity = parseFloat(avg);
    const colorClass = avgSeverity >= 7 ? 'text-red-400' : avgSeverity >= 4 ? 'text-yellow-400' : 'text-green-400';
    
    return `
      <div class="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
        <div class="flex items-center gap-2">
          <span>${icon}</span>
          <span class="capitalize text-sm">${typeLabel}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-500">${count}×</span>
          <span class="text-sm font-bold ${colorClass}">${avg}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render correlation insights
function renderCorrelations(symptoms, vitals) {
  const container = document.getElementById('correlation-panel');
  if (!container) return;
  
  if (!symptoms || symptoms.length === 0 || !vitals || vitals.length === 0) {
    container.innerHTML = `
      <div class="p-3 bg-gray-800 rounded-lg">
        <p class="text-gray-400">Start logging symptoms to see correlations with HRV, sleep, and meals.</p>
      </div>
    `;
    return;
  }
  
  const insights = [];
  
  // Calculate HRV correlation
  const symptomsWithHRV = symptoms.filter(s => {
    const date = s.date || (s.created_at ? s.created_at.split('T')[0] : null);
    return vitals.some(v => v.date === date);
  });
  
  if (symptomsWithHRV.length >= 3) {
    // Check if low HRV correlates with symptoms
    const lowHRVSymptoms = symptomsWithHRV.filter(s => {
      const date = s.date || (s.created_at ? s.created_at.split('T')[0] : null);
      const vital = vitals.find(v => v.date === date);
      return vital && vital.hrv < 51 && s.severity >= 5;
    });
    
    if (lowHRVSymptoms.length >= 2) {
      insights.push({
        icon: '💓',
        title: 'Low HRV = Higher Symptoms',
        text: `${lowHRVSymptoms.length} times your HRV was below 51ms when symptoms were severe.`,
        color: 'yellow'
      });
    }
    
    // Check if high HRV correlates with low symptoms
    const highHRVNoSymptoms = symptomsWithHRV.filter(s => {
      const date = s.date || (s.created_at ? s.created_at.split('T')[0] : null);
      const vital = vitals.find(v => v.date === date);
      return vital && vital.hrv >= 61 && s.severity <= 3;
    });
    
    if (highHRVNoSymptoms.length >= 2) {
      insights.push({
        icon: '✅',
        title: 'Good HRV = Milder Symptoms',
        text: `When HRV is above 61ms, symptoms tend to be milder.`,
        color: 'green'
      });
    }
  }
  
  // Bloating trend analysis
  const bloatingEntries = symptoms.filter(s => s.type === 'bloating');
  if (bloatingEntries.length >= 5) {
    const recentBloating = bloatingEntries.slice(-5);
    const avgRecent = recentBloating.reduce((sum, s) => sum + s.severity, 0) / recentBloating.length;
    const olderBloating = bloatingEntries.slice(-10, -5);
    
    if (olderBloating.length >= 3) {
      const avgOlder = olderBloating.reduce((sum, s) => sum + s.severity, 0) / olderBloating.length;
      
      if (avgRecent < avgOlder - 1) {
        insights.push({
          icon: '📉',
          title: 'Bloating Improving',
          text: `Average bloating decreased from ${avgOlder.toFixed(1)} to ${avgRecent.toFixed(1)} in the last 5 entries.`,
          color: 'green'
        });
      } else if (avgRecent > avgOlder + 1) {
        insights.push({
          icon: '📈',
          title: 'Bloating Increasing',
          text: `Average bloating increased from ${avgOlder.toFixed(1)} to ${avgRecent.toFixed(1)}.`,
          color: 'red'
        });
      }
    }
  }
  
  // Most common symptom
  const typeCounts = {};
  symptoms.forEach(s => {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  });
  const mostCommon = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
  
  if (mostCommon && mostCommon[1] >= 3) {
    insights.push({
      icon: '🔍',
      title: 'Most Common Symptom',
      text: `${mostCommon[0].replace(/_/g, ' ')} has been logged ${mostCommon[1]} times.`,
      color: 'blue'
    });
  }
  
  if (insights.length === 0) {
    container.innerHTML = `
      <div class="p-3 bg-gray-800 rounded-lg">
        <p class="text-gray-400">Keep logging symptoms to generate personalized insights.</p>
        <p class="text-xs text-gray-500 mt-1">${symptoms.length} symptoms logged so far</p>
      </div>
    `;
    return;
  }
  
  const colorClasses = {
    green: 'border-green-500 bg-green-900 bg-opacity-20',
    yellow: 'border-yellow-500 bg-yellow-900 bg-opacity-20',
    red: 'border-red-500 bg-red-900 bg-opacity-20',
    blue: 'border-blue-500 bg-blue-900 bg-opacity-20'
  };
  
  container.innerHTML = insights.map(i => `
    <div class="p-3 rounded-lg border-l-4 ${colorClasses[i.color] || colorClasses.blue}">
      <div class="flex items-start gap-3">
        <span class="text-xl">${i.icon}</span>
        <div>
          <div class="font-medium">${i.title}</div>
          <p class="text-sm text-gray-400">${i.text}</p>
        </div>
      </div>
    </div>
  `).join('');
}

function renderSymptomsChartOld(trends) {
  // Legacy function - replaced by renderSymptomsChart above
}

// Log Symptom
async function logSymptom() {
  const data = {
    type: document.getElementById('symptom-type').value,
    severity: parseInt(document.getElementById('symptom-severity').value),
    time: document.getElementById('symptom-time').value,
    notes: document.getElementById('symptom-notes').value,
    date: new Date().toISOString().split('T')[0]
  };
  
  await apiPost('/api/symptoms', data);
  await apiPost('/api/daily-logs', { type: 'symptom', ...data });
  
  // Reset form
  document.getElementById('symptom-severity').value = 5;
  document.getElementById('severity-value').textContent = '5';
  document.getElementById('symptom-notes').value = '';
  
  // Reload
  loadSymptoms();
  loadOverview();
  
  // Feedback
  showToast('Symptom logged!');
}

// Load Meals
async function loadMeals() {
  const meals = await apiGet('/api/meals');
  const reactions = await apiGet('/api/reactions');
  
  // Build reaction matrix
  const foodStats = {};
  
  meals?.forEach(m => {
    const foods = m.foods?.split(',').map(f => f.trim().toLowerCase()) || [];
    foods.forEach(food => {
      if (!foodStats[food]) {
        foodStats[food] = { count: 0, good: 0, neutral: 0, bad: 0 };
      }
      foodStats[food].count++;
      
      if (m.reaction === 'bad') foodStats[food].bad++;
      else if (m.reaction === 'none') foodStats[food].good++;
      else foodStats[food].neutral++;
    });
  });
  
  const matrixBody = document.getElementById('reaction-matrix-body');
  const foods = Object.entries(foodStats).sort((a, b) => b[1].count - a[1].count);
  
  if (foods.length > 0) {
    matrixBody.innerHTML = foods.map(([food, stats]) => {
      const status = stats.bad > stats.good ? 'text-accent-red' : 
                     stats.good > stats.bad ? 'text-accent-green' : 'text-accent-yellow';
      const statusText = stats.bad > stats.good ? 'Avoid' : 
                         stats.good > stats.bad ? 'Safe' : 'Caution';
      
      return `
        <tr class="border-b border-gray-800">
          <td class="p-2 capitalize">${food}</td>
          <td class="text-center p-2">${stats.count}</td>
          <td class="text-center p-2 text-accent-green">${stats.good}</td>
          <td class="text-center p-2 text-accent-yellow">${stats.neutral}</td>
          <td class="text-center p-2 text-accent-red">${stats.bad}</td>
          <td class="text-center p-2 ${status} font-medium">${statusText}</td>
        </tr>
      `;
    }).join('');
  }
}

// Log Meal
async function logMeal() {
  const data = {
    mealType: document.getElementById('meal-type').value,
    foods: document.getElementById('meal-foods').value,
    reaction: document.getElementById('meal-reaction').value,
    notes: document.getElementById('meal-notes').value,
    date: new Date().toISOString().split('T')[0]
  };
  
  await apiPost('/api/meals', data);
  await apiPost('/api/daily-logs', { type: 'meal', ...data });
  
  // Log reaction if bad
  if (data.reaction === 'bad') {
    await apiPost('/api/reactions', {
      food: data.foods,
      reaction: 'negative',
      severity: 5,
      date: data.date
    });
  }
  
  // Reset form
  document.getElementById('meal-foods').value = '';
  document.getElementById('meal-notes').value = '';
  setReaction('none');
  
  loadMeals();
  loadOverview();
  showToast('Meal logged!');
}

function setReaction(value) {
  document.getElementById('meal-reaction').value = value;
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    const btnValue = btn.dataset.value;
    btn.classList.remove('bg-accent-green', 'bg-accent-yellow', 'bg-accent-red');
    btn.classList.add('bg-gray-700');
    
    if (btnValue === value) {
      btn.classList.remove('bg-gray-700');
      if (value === 'none') btn.classList.add('bg-accent-green');
      if (value === 'mild') btn.classList.add('bg-accent-yellow');
      if (value === 'bad') btn.classList.add('bg-accent-red');
    }
  });
}

// Load Vitals
async function loadVitals() {
  console.log('=== DEBUG: loadVitals() START ===');
  
  try {
    console.log('DEBUG: Fetching energy data...');
    const energy = await apiGet('/api/energy');
    console.log('DEBUG: Energy data:', energy?.length, 'records');
    
    console.log('DEBUG: Fetching sleep data...');
    const sleep = await apiGet('/api/sleep');
    console.log('DEBUG: Sleep data:', sleep?.length, 'records');
    
    console.log('DEBUG: Fetching vitals data...');
    let vitals = await apiGet('/api/vitals');
    console.log('DEBUG: Vitals raw data:', vitals?.length, 'records');
    
    // Parse string values to numbers (API returns strings like "44.35")
    if (vitals && Array.isArray(vitals)) {
      console.log('DEBUG: Parsing vitals...');
      vitals = vitals.map(v => {
        try {
          return {
            ...v,
            hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null,
            rhr: v.rhr !== null && v.rhr !== undefined ? parseFloat(v.rhr) : null,
            blood_oxygen: v.blood_oxygen !== null && v.blood_oxygen !== undefined ? parseFloat(v.blood_oxygen) : null,
            respiratory_rate: v.respiratory_rate !== null && v.respiratory_rate !== undefined ? parseFloat(v.respiratory_rate) : null,
            heart_rate: v.heart_rate !== null && v.heart_rate !== undefined ? parseFloat(v.heart_rate) : null
          };
        } catch (err) {
          console.error('DEBUG: Error parsing vital record:', v, err);
          return v;
        }
      });
      console.log('DEBUG: Parsed vitals sample:', vitals.slice(0, 2));
    }
    
    // Render charts with individual error handling
    console.log('DEBUG: Rendering energy chart...');
    try {
      renderEnergyChart(energy);
    } catch (err) {
      console.error('DEBUG: Error rendering energy chart:', err);
    }
    
    console.log('DEBUG: Rendering sleep chart...');
    try {
      renderSleepChart(sleep);
    } catch (err) {
      console.error('DEBUG: Error rendering sleep chart:', err);
    }
    
    console.log('DEBUG: Rendering HRV trend chart...');
    try {
      renderHRVTrendChart(vitals);
    } catch (err) {
      console.error('DEBUG: Error rendering HRV trend chart:', err);
    }
    
    console.log('=== DEBUG: loadVitals() END ===');
  } catch (err) {
    console.error('DEBUG: loadVitals() ERROR:', err);
    console.error('DEBUG: loadVitals() stack:', err.stack);
  }
}

function renderHRVChart(vitals) {
  const ctx = document.getElementById('hrv-chart');
  if (!ctx) return;
  
  if (charts.hrv) charts.hrv.destroy();
  
  if (!vitals || vitals.length === 0) {
    // Show "No data" message
    return;
  }
  
  // Parse string values to numbers
  const parsedVitals = vitals.map(v => ({
    ...v,
    hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null
  }));
  
  // Sort by date and get last 30 days
  const sortedVitals = parsedVitals
    .filter(v => v.hrv !== null && v.hrv !== undefined && !isNaN(v.hrv))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-30);
  
  const labels = sortedVitals.map(v => v.date);
  const data = sortedVitals.map(v => v.hrv);
  const baseline = 61; // Your baseline
  
  charts.hrv = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'HRV (ms)',
        data,
        borderColor: '#6366f1',
        backgroundColor: '#6366f120',
        tension: 0.4,
        fill: true,
        pointRadius: 3
      }, {
        label: 'Baseline (61ms)',
        data: labels.map(() => baseline),
        borderColor: '#10b981',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9ca3af' } }
      },
      scales: {
        y: {
          min: 30,
          max: 100,
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', maxTicksLimit: 7 }
        }
      }
    }
  });
}

// 30-Day HRV Trend Chart with color-coded points
function renderHRVTrendChart(vitals) {
  console.log('=== DEBUG: renderHRVTrendChart() START ===');
  
  try {
    const ctx = document.getElementById('hrv-trend-chart');
    console.log('DEBUG: hrv-trend-chart canvas found:', !!ctx);
    
    if (!ctx) {
      console.error('DEBUG: hrv-trend-chart element NOT FOUND!');
      return;
    }
    
    if (charts.hrvTrend) {
      console.log('DEBUG: Destroying existing hrvTrend chart');
      charts.hrvTrend.destroy();
      charts.hrvTrend = null;
    }
    
    if (!vitals || !Array.isArray(vitals) || vitals.length === 0) {
      console.log('DEBUG: No vitals data for HRV chart');
      return;
    }
    console.log('DEBUG: Vitals data count:', vitals.length);
    
    // Parse string values to numbers and filter for valid HRV records
    const hrvData = vitals
      .map(v => {
        try {
          const hrv = v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null;
          return {
            ...v,
            hrv: hrv,
            date: v.date || (v.createdAt ? v.createdAt.split('T')[0] : null)
          };
        } catch (err) {
          console.error('DEBUG: Error parsing vital record:', v, err);
          return null;
        }
      })
      .filter(v => v && v.hrv !== null && v.hrv !== undefined && !isNaN(v.hrv) && v.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-30);
    
    console.log('DEBUG: HRV data points for chart:', hrvData.length);
    
    if (hrvData.length === 0) {
      console.log('DEBUG: No HRV data points after filtering');
      return;
    }
    
    // Format dates as MM-DD
    const labels = hrvData.map(v => {
      try {
        const date = new Date(v.date);
        return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      } catch (err) {
        return '--';
      }
    });
    
    const dataValues = hrvData.map(v => v.hrv);
    const baseline = 61;
    
    console.log('DEBUG: Chart labels:', labels.slice(0, 5), '...');
    console.log('DEBUG: Chart values:', dataValues.slice(0, 5), '...');
    
    // Create color-coded point colors based on HRV value
    const pointColors = dataValues.map(hrv => {
      if (hrv < 51) return '#ef4444'; // Red: Critical
      if (hrv < 61) return '#f59e0b'; // Yellow: Below baseline
      return '#10b981'; // Green: Normal/optimal
    });
    
    const pointRadii = dataValues.map(() => 5);
    
    charts.hrvTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'HRV (ms)',
          data: dataValues,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: pointRadii,
          pointHoverRadius: 7
        }, {
          label: 'Baseline (61ms)',
          data: labels.map(() => baseline),
          borderColor: '#6b7280',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            display: false
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb',
            borderColor: '#374151',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                const value = context.parsed.y;
                let status = '';
                if (value < 51) status = ' (Critical)';
                else if (value < 61) status = ' (Below Baseline)';
                else status = ' (Normal)';
                return `HRV: ${value}ms${status}`;
              }
            }
          }
        },
        scales: {
          y: {
            min: 30,
            max: 100,
            grid: { color: '#374151' },
            ticks: { 
              color: '#9ca3af',
              callback: function(value) {
                return value + ' ms';
              }
            },
            title: {
              display: true,
              text: 'HRV (ms)',
              color: '#6b7280',
              font: { size: 11 }
            }
          },
          x: {
            grid: { display: false },
            ticks: { 
              color: '#9ca3af',
              maxTicksLimit: 10
            },
            title: {
              display: true,
              text: 'Date',
              color: '#6b7280',
              font: { size: 11 }
            }
          }
        }
      }
    });
    console.log('DEBUG: HRV trend chart created successfully');
  } catch (err) {
    console.error('DEBUG: Error in renderHRVTrendChart():', err);
    console.error('DEBUG: Stack:', err.stack);
  }
  
  console.log('=== DEBUG: renderHRVTrendChart() END ===');
}

function renderEnergyChart(energy) {
  console.log('=== DEBUG: renderEnergyChart() START ===');
  
  try {
    const ctx = document.getElementById('energy-chart');
    if (!ctx) {
      console.error('DEBUG: energy-chart canvas element NOT FOUND!');
      return;
    }
    console.log('DEBUG: energy-chart canvas found');
    
    if (charts.energy) {
      console.log('DEBUG: Destroying existing energy chart');
      charts.energy.destroy();
    }
    
    if (!energy || !Array.isArray(energy) || energy.length === 0) {
      console.log('DEBUG: No energy data available');
      return;
    }
    console.log('DEBUG: Energy data count:', energy.length);
    
    const labels = energy.map(e => {
      try {
        return e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '--';
      } catch (err) {
        return '--';
      }
    }).slice(-14);
    
    const data = energy.map(e => {
      const level = parseInt(e.level);
      return isNaN(level) ? 0 : level;
    }).slice(-14);
    
    console.log('DEBUG: Chart labels:', labels);
    console.log('DEBUG: Chart data:', data);
    
    charts.energy = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Energy Level',
          data,
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f620',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#3b82f6'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb'
          }
        },
        scales: {
          y: { 
            min: 0, 
            max: 10, 
            grid: { color: '#374151' }, 
            ticks: { color: '#9ca3af' } 
          },
          x: { 
            grid: { display: false }, 
            ticks: { color: '#9ca3af', maxTicksLimit: 7 } 
          }
        }
      }
    });
    console.log('DEBUG: Energy chart created successfully');
  } catch (err) {
    console.error('DEBUG: Error in renderEnergyChart():', err);
    console.error('DEBUG: Stack:', err.stack);
  }
  
  console.log('=== DEBUG: renderEnergyChart() END ===');
}

function renderSleepChart(sleep) {
  console.log('=== DEBUG: renderSleepChart() START ===');
  
  try {
    const ctx = document.getElementById('sleep-chart');
    if (!ctx) {
      console.error('DEBUG: sleep-chart canvas element NOT FOUND!');
      return;
    }
    console.log('DEBUG: sleep-chart canvas found');
    
    if (charts.sleep) {
      console.log('DEBUG: Destroying existing sleep chart');
      charts.sleep.destroy();
    }
    
    if (!sleep || !Array.isArray(sleep) || sleep.length === 0) {
      console.log('DEBUG: No sleep data available');
      return;
    }
    console.log('DEBUG: Sleep data count:', sleep.length);
    
    // Handle both Apple Health format (durationHours, date) and manual format (hours, createdAt)
    // Map API field names to frontend expected names
    const sortedSleep = sleep
      .map(s => {
        try {
          return {
            date: s.date || (s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : null),
            hours: s.durationHours !== undefined ? parseFloat(s.durationHours) : 
                   s.totalHours !== undefined ? parseFloat(s.totalHours) : 
                   s.sleep_hours !== undefined ? parseFloat(s.sleep_hours) :
                   s.hours !== undefined ? parseFloat(s.hours) : 0,
            deepSleep: s.deepSleepMin !== undefined ? parseInt(s.deepSleepMin) : 
                       s.deepSleepMinutes !== undefined ? parseInt(s.deepSleepMinutes) : 
                       s.deep_sleep_minutes !== undefined ? parseInt(s.deep_sleep_minutes) : 0
          };
        } catch (err) {
          console.error('DEBUG: Error parsing sleep record:', s, err);
          return null;
        }
      })
      .filter(s => s && s.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-14);
    
    if (sortedSleep.length === 0) {
      console.log('DEBUG: No valid sleep data after filtering/sorting');
      return;
    }
    console.log('DEBUG: Valid sleep records:', sortedSleep.length);
    
    const labels = sortedSleep.map(s => s.date ? s.date.slice(5) : '--'); // MM-DD format
    const data = sortedSleep.map(s => s.hours || 0);
    const deepSleepData = sortedSleep.map(s => ((s.deepSleep || 0) / 60).toFixed(1)); // Convert min to hours
    
    console.log('DEBUG: Chart labels:', labels);
    console.log('DEBUG: Chart data (hours):', data);
    console.log('DEBUG: Chart deep sleep (hours):', deepSleepData);
    
    charts.sleep = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Total Sleep (hrs)',
          data,
          backgroundColor: '#8b5cf6',
          borderRadius: 4,
          borderWidth: 0
        }, {
          label: 'Deep Sleep (hrs)',
          data: deepSleepData,
          backgroundColor: '#10b981',
          borderRadius: 4,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { 
            labels: { color: '#9ca3af' } 
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb'
          }
        },
        scales: {
          y: { 
            min: 0, 
            max: 12, 
            grid: { color: '#374151' }, 
            ticks: { color: '#9ca3af' } 
          },
          x: { 
            grid: { display: false }, 
            ticks: { color: '#9ca3af', maxTicksLimit: 7 } 
          }
        }
      }
    });
    console.log('DEBUG: Sleep chart created successfully');
  } catch (err) {
    console.error('DEBUG: Error in renderSleepChart():', err);
    console.error('DEBUG: Stack:', err.stack);
  }
  
  console.log('=== DEBUG: renderSleepChart() END ===');
}

// Log Functions
async function logEnergy() {
  const data = {
    level: parseInt(document.getElementById('energy-level').value),
    date: new Date().toISOString().split('T')[0]
  };
  await apiPost('/api/energy', data);
  document.getElementById('energy-form').reset();
  document.getElementById('energy-value').textContent = '5';
  loadVitals();
  showToast('Energy logged!');
}

async function logSleep() {
  const data = {
    hours: parseFloat(document.getElementById('sleep-hours').value),
    quality: document.getElementById('sleep-quality').value,
    date: new Date().toISOString().split('T')[0]
  };
  await apiPost('/api/sleep', data);
  document.getElementById('sleep-form').reset();
  loadVitals();
  showToast('Sleep logged!');
}

async function logExercise() {
  const data = {
    type: document.getElementById('exercise-type').value,
    duration: parseInt(document.getElementById('exercise-duration').value),
    date: new Date().toISOString().split('T')[0]
  };
  await apiPost('/api/exercise', data);
  document.getElementById('exercise-form').reset();
  showToast('Exercise logged!');
}

// Load Research
async function loadResearch() {
  const research = await apiGet('/api/research');
  renderResearchList(research);
}

function renderResearchList(research, filter = null) {
  const list = document.getElementById('research-list');
  
  let items = research || [];
  if (filter && filter !== 'all') {
    items = items.filter(r => r.tags?.some(t => t.toLowerCase().includes(filter.toLowerCase())));
  }
  
  if (items.length === 0) {
    list.innerHTML = '<p class="text-gray-400 text-center py-8">No research found</p>';
    return;
  }
  
  list.innerHTML = items.map(r => `
    <div class="card p-6 ${r.read ? 'opacity-75' : ''}">
      <div class="flex flex-wrap justify-between items-start gap-2 mb-2">
        <h3 class="text-lg font-semibold">${r.title}</h3>
        <span class="text-xs px-2 py-1 ${r.relevance === 'high' ? 'bg-accent-red' : r.relevance === 'medium' ? 'bg-accent-yellow text-black' : 'bg-gray-600'} rounded">
          ${r.relevance} relevance
        </span>
      </div>
      <p class="text-sm text-gray-400 mb-3">${r.summary}</p>
      <div class="flex flex-wrap gap-2 mb-3">
        ${r.tags?.map(t => `<span class="text-xs px-2 py-1 bg-gray-800 rounded-full">#${t}</span>`).join('') || ''}
      </div>
      <div class="flex justify-between items-center text-xs text-gray-500">
        <span>Source: ${r.source || 'Unknown'}</span>
        <span>${r.addedBy === 'agent' ? '🤖 Agent' : '👤 User'}</span>
      </div>
    </div>
  `).join('');
}

function filterByTag(tag) {
  apiGet('/api/research').then(research => renderResearchList(research, tag));
}

function searchResearch() {
  const query = document.getElementById('research-search').value;
  if (!query) {
    loadResearch();
    return;
  }
  
  apiGet(`/api/research/search?q=${encodeURIComponent(query)}`).then(results => {
    renderResearchList(results);
  });
}

// Load Briefings
async function loadBriefings() {
  const briefings = await apiGet('/api/briefings');
  const list = document.getElementById('briefings-list');
  
  if (!briefings || briefings.length === 0) {
    list.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-4">📋</div>
        <p>No briefings yet</p>
        <p class="text-sm mt-2">Generate a morning or evening briefing to get started</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = briefings.slice().reverse().map(b => `
    <div class="card p-6">
      <div class="flex justify-between items-start mb-4">
        <div class="flex items-center gap-2">
          <span class="text-2xl">${b.type === 'morning' ? '🌅' : '🌙'}</span>
          <div>
            <h3 class="font-semibold capitalize">${b.type} Briefing</h3>
            <p class="text-xs text-gray-400">${new Date(b.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <span class="text-xs text-gray-500">${b.generatedBy === 'agent' ? '🤖 Agent' : '👤 User'}</span>
      </div>
      <div class="prose prose-invert max-w-none text-sm text-gray-300 whitespace-pre-wrap">${b.content || 'No content available'}</div>
      ${b.highlights?.length > 0 ? `
        <div class="mt-4 pt-4 border-t border-gray-700">
          <p class="text-xs text-gray-400 mb-2">Highlights:</p>
          <ul class="text-sm space-y-1">
            ${b.highlights.map(h => `<li class="text-primary-400">• ${h}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function requestBriefing(type) {
  showToast(`${type === 'morning' ? 'Morning' : 'Evening'} briefing requested! Check back soon.`);
  // In a real app, this would trigger an agent to generate the briefing
}

// Quick Log Modal
function showQuickLog() {
  document.getElementById('quick-log-modal').classList.remove('hidden');
}

function hideQuickLog() {
  document.getElementById('quick-log-modal').classList.add('hidden');
}

function quickLogType(type) {
  hideQuickLog();
  if (type === 'supplement') {
    showTab('protocol');
  } else if (type === 'symptom') {
    showTab('symptoms');
  } else if (type === 'meal') {
    showTab('meals');
  } else if (type === 'energy') {
    showTab('vitals');
  }
}

// Toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 bg-primary-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Close modal on backdrop click
document.getElementById('quick-log-modal').addEventListener('click', (e) => {
  if (e.target.id === 'quick-log-modal') hideQuickLog();
});

// ============ SIBO ADVANCED FUNCTIONS ============

function showSiboSection(section) {
  // Hide all sections
  document.querySelectorAll('.sibo-section').forEach(s => s.classList.add('hidden'));
  // Show selected
  document.getElementById(`sibo-section-${section}`).classList.remove('hidden');
  // Update button states
  document.querySelectorAll('[id^="sibo-btn-"]').forEach(btn => {
    btn.classList.remove('ring-2', 'ring-white');
  });
  document.getElementById(`sibo-btn-${section}`).classList.add('ring-2', 'ring-white');
  
  // Load data if needed
  if (section === 'history') loadTreatmentHistory();
  if (section === 'schedule') loadProtocolSchedule();
  if (section === 'maintenance') loadMaintenanceStatus();
}

// Die-Off Manager
async function logDieOffEpisode() {
  const severity = parseInt(document.getElementById('dieoff-severity').value);
  const symptoms = Array.from(document.getElementById('dieoff-symptoms').selectedOptions).map(o => o.value);
  
  await apiPost('/api/dieoff/episodes', { severity, symptoms, notes: '' });
  showToast('Die-off episode logged');
  document.getElementById('dieoff-severity').value = 5;
  document.getElementById('dieoff-severity-val').textContent = '5';
}

// SIFO Risk Assessment
async function calculateSifoRisk() {
  const checkboxes = document.querySelectorAll('.sifo-risk:checked');
  const riskFactors = Array.from(checkboxes).map(cb => cb.value);
  
  const result = await apiPost('/api/sifo/assessment', { riskFactors });
  
  const resultDiv = document.getElementById('sifo-result');
  resultDiv.classList.remove('hidden');
  
  const colors = { low: 'green', moderate: 'yellow', high: 'red' };
  const color = colors[result.riskLevel] || 'gray';
  
  resultDiv.innerHTML = `
    <div class="bg-${color}-900 border border-${color}-500 p-4 rounded-lg">
      <div class="text-center mb-4">
        <div class="text-4xl font-bold text-${color}-400">${result.score}</div>
        <div class="text-lg capitalize text-${color}-300">${result.riskLevel} Risk</div>
      </div>
      <div class="border-t border-${color}-700 pt-4">
        <h4 class="font-bold mb-2">Recommendations:</h4>
        <ul class="space-y-1 text-sm">
          ${result.recommendations.map(r => `<li>• ${r}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

// Treatment History
async function loadTreatmentHistory() {
  const analysis = await apiGet('/api/treatment-history/analysis');
  const container = document.getElementById('treatment-analysis');
  
  if (!analysis.totalTreatments) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <p>No treatment history recorded yet</p>
        <p class="text-sm mt-2">Add your past treatments below to get personalized recommendations</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-gray-800 p-4 rounded-lg text-center">
        <div class="text-2xl font-bold text-accent-blue">${analysis.totalTreatments}</div>
        <div class="text-xs text-gray-400">Total Treatments</div>
      </div>
      <div class="bg-gray-800 p-4 rounded-lg text-center">
        <div class="text-2xl font-bold text-red-400">${analysis.patterns.noBiofilmDisruption.count}</div>
        <div class="text-xs text-gray-400">No Biofilm</div>
      </div>
      <div class="bg-gray-800 p-4 rounded-lg text-center">
        <div class="text-2xl font-bold text-yellow-400">${analysis.patterns.insufficientDuration.count}</div>
        <div class="text-xs text-gray-400">Too Short</div>
      </div>
      <div class="bg-gray-800 p-4 rounded-lg text-center">
        <div class="text-2xl font-bold text-accent-purple">${analysis.patterns.noProkinetic.count}</div>
        <div class="text-xs text-gray-400">No Prokinetic</div>
      </div>
    </div>
    <div class="bg-accent-green bg-opacity-10 border border-accent-green p-4 rounded-lg">
      <h4 class="font-bold text-accent-green mb-2">🎯 Recommended Protocol Adjustments</h4>
      <ul class="space-y-1">
        ${analysis.recommendations.map(r => `<li>✓ ${r}</li>`).join('')}
      </ul>
    </div>
  `;
}

async function addTreatmentHistory() {
  const treatment = {
    name: document.getElementById('treatment-name').value,
    durationWeeks: parseInt(document.getElementById('treatment-weeks').value),
    outcome: document.getElementById('treatment-outcome').value,
    biofilmDisruptors: document.getElementById('treatment-biofilm').checked,
    prokinetic: document.getElementById('treatment-prokinetic').checked,
    underdosed: document.getElementById('treatment-underdosed').checked
  };
  
  await apiPost('/api/treatment-history', treatment);
  showToast('Treatment added to history');
  loadTreatmentHistory();
  
  // Clear form
  document.getElementById('treatment-name').value = '';
  document.getElementById('treatment-weeks').value = '';
}

// Protocol Schedule
async function loadProtocolSchedule() {
  const week = document.getElementById('current-protocol-week').value || 1;
  const schedule = await apiGet(`/api/protocol-schedule/${week}`);
  
  const container = document.getElementById('protocol-schedule-display');
  
  if (schedule.maintenance) {
    container.innerHTML = `
      <div class="bg-accent-green bg-opacity-20 border border-accent-green p-6 rounded-lg text-center">
        <div class="text-4xl mb-4">🎉</div>
        <h4 class="text-xl font-bold text-accent-green mb-2">Protocol Complete!</h4>
        <p>Transition to maintenance phase. Setup relapse prevention.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="bg-gray-800 p-4 rounded-lg mb-4">
      <div class="flex justify-between items-center mb-2">
        <h4 class="font-bold text-lg">${schedule.phase}</h4>
        <span class="text-sm text-gray-400">Week ${schedule.weeks}</span>
      </div>
      ${schedule.noAntimicrobials ? '<div class="text-yellow-400 text-sm mb-4">⚠️ NO ANTIMICROBIALS THIS PHASE</div>' : ''}
    </div>
    
    <div class="space-y-3">
      ${schedule.supplements.map(s => `
        <div class="bg-gray-800 p-4 rounded-lg flex justify-between items-center">
          <div>
            <div class="font-bold">${s.name} ${s.dose}</div>
            <div class="text-sm text-gray-400">${s.timing}</div>
          </div>
          <span class="text-sm bg-primary-600 px-3 py-1 rounded-full">${s.when}</span>
        </div>
      `).join('')}
    </div>
    
    ${schedule.dailyTotals ? `
      <div class="mt-4 bg-accent-blue bg-opacity-10 border border-accent-blue p-4 rounded-lg">
        <h5 class="font-bold text-accent-blue mb-2">Daily Totals</h5>
        <div class="grid grid-cols-3 gap-4 text-center">
          ${Object.entries(schedule.dailyTotals).map(([k,v]) => `
            <div>
              <div class="text-lg font-bold">${v}</div>
              <div class="text-xs text-gray-400 capitalize">${k}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// Maintenance
async function loadMaintenanceStatus() {
  const status = await apiGet('/api/maintenance/schedule');
  const container = document.getElementById('maintenance-status');
  
  if (status.error) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <p>${status.error}</p>
        <p class="text-sm mt-2">Mark your protocol as complete to see maintenance schedule</p>
      </div>
    `;
    return;
  }
  
  const phaseColors = {
    'Critical Window': 'red',
    'Consolidation': 'yellow',
    'Maintenance': 'blue',
    'Sustain': 'green'
  };
  const color = phaseColors[status.phase] || 'gray';
  
  container.innerHTML = `
    <div class="bg-${color}-900 bg-opacity-30 border border-${color}-500 p-6 rounded-lg">
      <div class="flex justify-between items-center mb-4">
        <h4 class="text-xl font-bold text-${color}-400">${status.phase}</h4>
        <span class="text-sm text-gray-400">Week ${status.weeksSince} post-protocol</span>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div class="bg-gray-800 p-4 rounded-lg">
          <div class="text-sm text-gray-400 mb-1">Prokinetic</div>
          <div class="font-medium">${status.schedule.prokinetic}</div>
        </div>
        <div class="bg-gray-800 p-4 rounded-lg">
          <div class="text-sm text-gray-400 mb-1">Antimicrobials</div>
          <div class="font-medium">${status.schedule.antimicrobials}</div>
        </div>
        <div class="bg-gray-800 p-4 rounded-lg">
          <div class="text-sm text-gray-400 mb-1">Monitoring</div>
          <div class="font-medium">${status.schedule.monitoring}</div>
        </div>
      </div>
    </div>
  `;
}

async function markProtocolComplete() {
  await apiPost('/api/protocol/complete', {});
  showToast('Protocol marked complete - begin maintenance!');
  loadMaintenanceStatus();
}

// Reports
async function generateReport(type) {
  const endpoint = type === 'medical' ? '/api/reports/medical' : '/api/reports/weekly';
  const report = await apiGet(endpoint);
  
  const container = document.getElementById('report-display');
  
  if (type === 'medical') {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center border-b border-gray-700 pb-2">
          <span class="text-gray-400">Generated</span>
          <span>${new Date(report.generatedAt).toLocaleString()}</span>
        </div>
        
        <div>
          <h5 class="font-bold mb-2">Treatment History</h5>
          <p>Total treatments: ${report.treatmentHistory.total}</p>
        </div>
        
        <div>
          <h5 class="font-bold mb-2">Symptom Summary (30 days)</h5>
          <div class="grid grid-cols-2 gap-2">
            ${Object.entries(report.symptomSummary.averages).map(([type, data]) => `
              <div class="bg-gray-700 p-2 rounded">
                <div class="text-sm capitalize">${type}</div>
                <div class="text-lg font-bold">${data.avg}/10</div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div>
          <h5 class="font-bold mb-2">Die-Off Episodes (30 days)</h5>
          <p>Count: ${report.dieoffEpisodes.count} | Avg Severity: ${report.dieoffEpisodes.avgSeverity}/10</p>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-gray-700 p-3 rounded text-center">
            <div class="text-2xl font-bold text-accent-green">${report.adherence.rate}%</div>
            <div class="text-xs text-gray-400">Adherence</div>
          </div>
          <div class="bg-gray-700 p-3 rounded text-center">
            <div class="text-2xl font-bold text-accent-blue">${report.symptoms.count}</div>
            <div class="text-xs text-gray-400">Symptoms</div>
          </div>
          <div class="bg-gray-700 p-3 rounded text-center">
            <div class="text-2xl font-bold ${report.dieoffEpisodes > 0 ? 'text-accent-red' : 'text-gray-400'}">${report.dieoffEpisodes}</div>
            <div class="text-xs text-gray-400">Die-Off</div>
          </div>
        </div>
      </div>
    `;
  }
}

// Start
init();// Load Sleep
async function loadSleep() {
  console.log('=== DEBUG: loadSleep() START ===');
  try {
    // Fetch sleep data
    console.log('DEBUG: Fetching sleep data...');
    const sleepRes = await fetch(`${API_BASE}/api/sleep`);
    console.log('DEBUG: Sleep response status:', sleepRes.status);
    let sleepData = await sleepRes.json();
    console.log('DEBUG: Sleep raw data:', sleepData?.length, 'records');
    
    // Fetch vitals for HRV correlation
    console.log('DEBUG: Fetching vitals for sleep correlation...');
    const vitalsRes = await fetch(`${API_BASE}/api/vitals`);
    console.log('DEBUG: Vitals response status:', vitalsRes.status);
    let vitalsData = await vitalsRes.json();
    console.log('DEBUG: Vitals raw data:', vitalsData?.length, 'records');
    
    // Parse vitals string values to numbers
    if (vitalsData && Array.isArray(vitalsData)) {
      vitalsData = vitalsData.map(v => ({
        ...v,
        hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null
      }));
    }
    
    // Map API field names to frontend expected names
    if (sleepData && Array.isArray(sleepData)) {
      console.log('DEBUG: Mapping sleep field names...');
      console.log('DEBUG: Sample sleep record:', sleepData[0]);
      sleepData = sleepData.map(s => ({
        ...s,
        // Map API snake_case field names to frontend camelCase names
        totalHours: s.totalHours !== undefined ? s.totalHours : 
                    s.durationHours !== undefined ? s.durationHours : 
                    s.sleep_hours !== undefined ? parseFloat(s.sleep_hours) : 
                    s.duration || 0,
        deepSleepMinutes: s.deepSleepMinutes !== undefined ? s.deepSleepMinutes : 
                          s.deepSleepMin !== undefined ? s.deepSleepMin : 
                          s.deep_sleep_minutes !== undefined ? s.deep_sleep_minutes : 0,
        remMinutes: s.remMinutes !== undefined ? s.remMinutes : 
                    s.remMin !== undefined ? s.remMin : 
                    s.rem_minutes !== undefined ? s.rem_minutes : 0,
        coreMinutes: s.coreMinutes !== undefined ? s.coreMinutes : 
                     s.coreMin !== undefined ? s.coreMin : 
                     s.core_minutes !== undefined ? s.core_minutes : 0,
        awakeMinutes: s.awakeMinutes !== undefined ? s.awakeMinutes : 
                      s.awakeMin !== undefined ? s.awakeMin : 
                      s.awake_minutes !== undefined ? s.awake_minutes : 0,
        quality: s.quality !== undefined ? s.quality : s.sleep_quality || 0,
        // Ensure date is properly parsed
        date: s.date || (s.createdAt ? s.createdAt.split('T')[0] : new Date().toISOString().split('T')[0])
      }));
      console.log('DEBUG: Mapped sleep sample:', sleepData[0]);
      
      // DEDUPLICATE: Group by date and prefer Apple Health data
      console.log('DEBUG: Deduplicating sleep data...');
      console.log('DEBUG: Before deduplication:', sleepData.length, 'records');
      
      const sleepByDate = new Map();
      
      for (const record of sleepData) {
        if (!record.date) continue;
        
        const existing = sleepByDate.get(record.date);
        
        if (!existing) {
          // First record for this date
          sleepByDate.set(record.date, record);
        } else {
          // Compare and keep the better record
          // Score each record - higher is better
          const scoreRecord = (r) => {
            let score = 0;
            // Apple Health data has these complete fields
            if (r.totalHours && r.totalHours > 0) score += 10;
            if (r.deepSleepMinutes && r.deepSleepMinutes > 0) score += 5;
            if (r.remMinutes && r.remMinutes > 0) score += 5;
            if (r.coreMinutes && r.coreMinutes > 0) score += 3;
            if (r.awakeMinutes && r.awakeMinutes > 0) score += 2;
            if (r.quality && r.quality > 0) score += 1;
            // Prefer records with source='apple_health' or similar
            if (r.source && r.source.toLowerCase().includes('apple')) score += 20;
            if (r.source && r.source.toLowerCase().includes('health')) score += 10;
            return score;
          };
          
          const existingScore = scoreRecord(existing);
          const newScore = scoreRecord(record);
          
          console.log(`DEBUG: Date ${record.date} - Existing score: ${existingScore}, New score: ${newScore}`);
          
          if (newScore > existingScore) {
            console.log(`DEBUG: Replacing record for ${record.date} with better data`);
            sleepByDate.set(record.date, record);
          }
        }
      }
      
      // Convert map back to array and sort by date descending
      sleepData = Array.from(sleepByDate.values()).sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });
      
      console.log('DEBUG: After deduplication:', sleepData.length, 'records');
      console.log('DEBUG: Deduplicated dates:', sleepData.map(s => s.date).slice(0, 10));
    }
    
    if (sleepData && sleepData.length > 0) {
      console.log('DEBUG: Rendering sleep components...');
      
      try {
        renderSleepSummary(sleepData);
      } catch (err) {
        console.error('DEBUG: Error rendering sleep summary:', err);
      }
      
      try {
        renderLatestSleep(sleepData[sleepData.length - 1]);
      } catch (err) {
        console.error('DEBUG: Error rendering latest sleep:', err);
      }
      
      try {
        renderSleepDurationChart(sleepData);
      } catch (err) {
        console.error('DEBUG: Error rendering sleep duration chart:', err);
      }
      
      try {
        renderDeepSleepTrendChart(sleepData, vitalsData);
      } catch (err) {
        console.error('DEBUG: Error rendering deep sleep trend chart:', err);
      }
      
      try {
        renderSleepStagesChart(sleepData);
      } catch (err) {
        console.error('DEBUG: Error rendering sleep stages chart:', err);
      }
      
      try {
        renderSleepHRVChart(sleepData, vitalsData);
      } catch (err) {
        console.error('DEBUG: Error rendering sleep HRV chart:', err);
      }
      
      try {
        renderSleepHistoryTable(sleepData);
      } catch (err) {
        console.error('DEBUG: Error rendering sleep history table:', err);
      }
      
    } else {
      console.log('DEBUG: No sleep data to render');
      const historyTable = document.getElementById('sleep-history-table');
      if (historyTable) {
        historyTable.innerHTML = `
          <tr><td colspan="7" class="p-4 text-center text-gray-500">No sleep data yet. Start logging!</td></tr>
        `;
      }
    }
    console.log('=== DEBUG: loadSleep() END ===');
  } catch (error) {
    console.error('DEBUG: Error loading sleep data:', error);
    console.error('DEBUG: Error stack:', error.stack);
    const historyTable = document.getElementById('sleep-history-table');
    if (historyTable) {
      historyTable.innerHTML = `
        <tr><td colspan="7" class="p-4 text-center text-red-500">Error loading sleep data</td></tr>
      `;
    }
  }
}

function renderSleepSummary(sleepData) {
  if (!sleepData || sleepData.length === 0) {
    console.log('No sleep data available');
    return;
  }
  
  const latest = sleepData[sleepData.length - 1];
  const last7Days = sleepData.slice(-7);
  
  // Last night total - handle different field names
  const totalHours = latest.totalHours || latest.durationHours || latest.duration || 0;
  const totalHoursEl = document.getElementById('sleep-last-total');
  if (totalHoursEl) {
    totalHoursEl.textContent = totalHours ? `${Number(totalHours).toFixed(1)}h` : '--';
  }
  
  const lastDateEl = document.getElementById('sleep-last-date');
  if (lastDateEl && latest.date) {
    lastDateEl.textContent = new Date(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  
  // Last night deep sleep
  const deepMin = latest.deepSleepMinutes || latest.deepSleepMin || 0;
  const lastDeepEl = document.getElementById('sleep-last-deep');
  if (lastDeepEl) {
    lastDeepEl.textContent = deepMin ? `${deepMin} min` : '--';
  }
  
  // Color code deep sleep target
  const deepTarget = document.getElementById('sleep-deep-target');
  if (deepTarget) {
    if (deepMin >= 90) {
      deepTarget.textContent = '✅ Target: 90-120 min';
      deepTarget.className = 'text-xs text-green-400';
    } else if (deepMin >= 60) {
      deepTarget.textContent = '⚠️ Target: 90-120 min';
      deepTarget.className = 'text-xs text-yellow-400';
    } else {
      deepTarget.textContent = '❌ Target: 90-120 min';
      deepTarget.className = 'text-xs text-red-400';
    }
  }
  
  // Last night quality
  const lastQualityEl = document.getElementById('sleep-last-quality');
  if (lastQualityEl) {
    lastQualityEl.textContent = latest.quality || '--';
  }
  
  // 7-day average deep sleep
  const avgDeep = last7Days.reduce((sum, night) => sum + (night.deepSleepMinutes || night.deepSleepMin || 0), 0) / last7Days.length;
  const avgDeepEl = document.getElementById('sleep-avg-deep');
  if (avgDeepEl) {
    avgDeepEl.textContent = !isNaN(avgDeep) && avgDeep > 0 ? `${Math.round(avgDeep)} min` : '--';
  }
  
  // Deep sleep deficit
  const deficitEl = document.getElementById('sleep-deep-deficit');
  if (deficitEl) {
    const deficit = 105 - avgDeep; // 105 is mid-point of 90-120 target
    if (!isNaN(avgDeep) && avgDeep > 0) {
      if (deficit > 0) {
        deficitEl.textContent = `${Math.round(deficit)} min below target`;
        deficitEl.className = 'text-xs text-red-400';
      } else {
        deficitEl.textContent = '✅ Meeting target';
        deficitEl.className = 'text-xs text-green-400';
      }
    } else {
      deficitEl.textContent = '--';
    }
  }
  
  // 7-day average quality
  const avgQuality = last7Days.reduce((sum, night) => sum + (parseInt(night.quality) || 0), 0) / last7Days.length;
  const avgQualityEl = document.getElementById('sleep-avg-quality');
  if (avgQualityEl) {
    if (!isNaN(avgQuality) && avgQuality > 0) {
      avgQualityEl.textContent = avgQuality.toFixed(1);
      // Color code quality
      if (avgQuality >= 7) avgQualityEl.className = 'text-2xl font-bold text-green-400';
      else if (avgQuality >= 5) avgQualityEl.className = 'text-2xl font-bold text-yellow-400';
      else avgQualityEl.className = 'text-2xl font-bold text-red-400';
    } else {
      avgQualityEl.textContent = '--';
    }
  }
}

// 14-Day Sleep Duration Bar Chart with Quality Color Coding
function renderSleepDurationChart(sleepData) {
  console.log('=== DEBUG: renderSleepDurationChart() START ===');
  
  try {
    const ctx = document.getElementById('sleep-duration-chart');
    if (!ctx) {
      console.error('DEBUG: sleep-duration-chart canvas element NOT FOUND!');
      return;
    }
    console.log('DEBUG: sleep-duration-chart canvas found');
    
    // Destroy existing chart if exists
    if (charts.sleepDuration) {
      console.log('DEBUG: Destroying existing sleepDuration chart');
      charts.sleepDuration.destroy();
      charts.sleepDuration = null;
    }
    
    if (!sleepData || !Array.isArray(sleepData) || sleepData.length === 0) {
      console.log('DEBUG: No sleep data for duration chart');
      return;
    }
    console.log('DEBUG: Sleep data count:', sleepData.length);
    
    // Get last 14 days and parse data properly
    const last14Days = sleepData
      .map(d => {
        try {
          return {
            date: d.date,
            totalHours: d.totalHours !== undefined ? parseFloat(d.totalHours) :
                       d.durationHours !== undefined ? parseFloat(d.durationHours) :
                       d.sleep_hours !== undefined ? parseFloat(d.sleep_hours) :
                       d.duration !== undefined ? parseFloat(d.duration) : 0
          };
        } catch (err) {
          console.error('DEBUG: Error parsing sleep record:', d, err);
          return null;
        }
      })
      .filter(d => d && d.date)
      .slice(-14);
    
    if (last14Days.length === 0) {
      console.log('DEBUG: No valid sleep data after filtering');
      return;
    }
    console.log('DEBUG: Valid sleep records:', last14Days.length);
    
    // Prepare labels and data
    const labels = last14Days.map(d => {
      try {
        return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } catch (err) {
        return '--';
      }
    });
    const durations = last14Days.map(d => d.totalHours || 0);
    
    console.log('DEBUG: Chart labels:', labels);
    console.log('DEBUG: Chart durations:', durations);
    
    // Color code bars based on duration: red < 6h, yellow 6-7h, green > 7h
    const backgroundColors = durations.map(hours => {
      if (hours < 6) return '#ef4444'; // red
      if (hours <= 7) return '#f59e0b'; // yellow/amber
      return '#10b981'; // green
    });
    
    const borderColors = durations.map(hours => {
      if (hours < 6) return '#dc2626';
      if (hours <= 7) return '#d97706';
      return '#059669';
    });
    
    charts.sleepDuration = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hours Slept',
          data: durations,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb',
            callbacks: {
              label: function(context) {
                const hours = context.parsed.y;
                let quality = hours > 7 ? 'Good' : hours >= 6 ? 'Fair' : 'Poor';
                return `${hours ? hours.toFixed(1) : '--'} hours (${quality})`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 12,
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
            title: {
              display: true,
              text: 'Hours',
              color: '#9ca3af'
            }
          },
          x: {
            grid: { display: false },
            ticks: { 
              color: '#9ca3af',
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    });
    console.log('DEBUG: Sleep duration chart created successfully');
  } catch (err) {
    console.error('DEBUG: Error in renderSleepDurationChart():', err);
    console.error('DEBUG: Stack:', err.stack);
  }
  
  console.log('=== DEBUG: renderSleepDurationChart() END ===');
}

// Deep Sleep Trend Line Chart with HRV Correlation
function renderDeepSleepTrendChart(sleepData, vitalsData) {
  console.log('=== DEBUG: renderDeepSleepTrendChart() START ===');
  
  try {
    const ctx = document.getElementById('deep-sleep-trend-chart');
    if (!ctx) {
      console.error('DEBUG: deep-sleep-trend-chart canvas element NOT FOUND!');
      return;
    }
    console.log('DEBUG: deep-sleep-trend-chart canvas found');
    
    // Destroy existing chart if exists
    if (charts.deepSleepTrend) {
      console.log('DEBUG: Destroying existing deepSleepTrend chart');
      charts.deepSleepTrend.destroy();
      charts.deepSleepTrend = null;
    }
    
    if (!sleepData || !Array.isArray(sleepData) || sleepData.length === 0) {
      console.log('DEBUG: No sleep data for deep sleep trend chart');
      return;
    }
    console.log('DEBUG: Sleep data count:', sleepData.length);
    
    // Get last 14 days with parsed data
    const last14Days = sleepData
      .map(d => {
        try {
          return {
            date: d.date,
            deepSleepMinutes: d.deepSleepMinutes !== undefined ? parseInt(d.deepSleepMinutes) :
                             d.deepSleepMin !== undefined ? parseInt(d.deepSleepMin) :
                             d.deep_sleep_minutes !== undefined ? parseInt(d.deep_sleep_minutes) : 0
          };
        } catch (err) {
          console.error('DEBUG: Error parsing sleep record:', d, err);
          return null;
        }
      })
      .filter(d => d && d.date)
      .slice(-14);
    
    if (last14Days.length === 0) {
      console.log('DEBUG: No valid sleep data after filtering');
      return;
    }
    console.log('DEBUG: Valid sleep records:', last14Days.length);
    
    // Prepare labels
    const labels = last14Days.map(d => {
      try {
        return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } catch (err) {
        return '--';
      }
    });
    
    // Deep sleep data
    const deepSleepData = last14Days.map(d => d.deepSleepMinutes || 0);
    
    // Match with HRV data by date - ensure vitals HRV values are parsed numbers
    const hrvData = last14Days.map(sleep => {
      if (!sleep.date || !vitalsData || !Array.isArray(vitalsData)) return null;
      try {
        const sleepDate = new Date(sleep.date).toISOString().split('T')[0];
        const matchingVital = vitalsData.find(v => v.date === sleepDate);
        const hrv = matchingVital && matchingVital.hrv !== null && matchingVital.hrv !== undefined 
          ? parseFloat(matchingVital.hrv) 
          : null;
        return hrv && !isNaN(hrv) ? hrv : null;
      } catch (err) {
        return null;
      }
    });
    
    console.log('DEBUG: Deep sleep data:', deepSleepData);
    console.log('DEBUG: HRV data:', hrvData);
    
    charts.deepSleepTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Deep Sleep (min)',
            data: deepSleepData,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: '#8b5cf6',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            yAxisID: 'y'
          },
          {
            label: 'HRV (ms)',
            data: hrvData,
            borderColor: '#3b82f6',
            backgroundColor: '#3b82f6',
            borderWidth: 0,
            pointRadius: 6,
            pointStyle: 'circle',
            showLine: false,
            yAxisID: 'y1'
          },
          {
            label: 'Optimal Target (90min)',
            data: labels.map(() => 90),
            borderColor: '#10b981',
            borderWidth: 2,
            borderDash: [8, 4],
            pointRadius: 0,
            fill: false,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: { 
              color: '#e5e7eb',
              usePointStyle: true,
              padding: 20
            }
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb',
            callbacks: {
              title: (items) => items[0].label,
              label: (context) => {
                if (context.dataset.label === 'Deep Sleep (min)') {
                  const val = context.parsed.y;
                  const status = val >= 90 ? '✅ Optimal' : val >= 60 ? '⚠️ Low' : '❌ Very Low';
                  return `Deep Sleep: ${val} min ${status}`;
                }
                if (context.dataset.label === 'HRV (ms)') {
                  return context.parsed.y ? `HRV: ${context.parsed.y} ms` : 'HRV: No data';
                }
                return `${context.dataset.label}: ${context.parsed.y}`;
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            max: 150,
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
            title: {
              display: true,
              text: 'Deep Sleep (minutes)',
              color: '#8b5cf6'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            min: 30,
            max: 100,
            grid: { drawOnChartArea: false },
            ticks: { color: '#3b82f6' },
            title: {
              display: true,
              text: 'HRV (ms)',
              color: '#3b82f6'
            }
          },
          x: {
            grid: { color: '#374151' },
            ticks: { 
              color: '#9ca3af',
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    });
    console.log('DEBUG: Deep sleep trend chart created successfully');
  } catch (err) {
    console.error('DEBUG: Error in renderDeepSleepTrendChart():', err);
    console.error('DEBUG: Stack:', err.stack);
  }
  
  console.log('=== DEBUG: renderDeepSleepTrendChart() END ===');
}

function renderLatestSleep(sleep) {
  if (!sleep) {
    console.log('No latest sleep data available');
    return;
  }
  
  // Sleep times - handle different field names
  const totalHours = sleep.totalHours || sleep.durationHours || sleep.duration || 0;
  
  const fellAsleepEl = document.getElementById('sleep-latest-fell-asleep');
  if (fellAsleepEl) fellAsleepEl.textContent = sleep.fellAsleep || sleep.bedtime || '--';
  
  const wokeUpEl = document.getElementById('sleep-latest-woke-up');
  if (wokeUpEl) wokeUpEl.textContent = sleep.wokeUp || sleep.waketime || '--';
  
  const durationEl = document.getElementById('sleep-latest-duration');
  if (durationEl) {
    durationEl.textContent = totalHours ? `${Number(totalHours).toFixed(1)} hours` : '--';
  }
  
  // Sleep stages
  const stages = sleep.stages || {};
  
  // Awake
  const awakePct = stages.awake || 0;
  const awakeMin = sleep.awakeMinutes || sleep.awakeMin || 0;
  const awakePctEl = document.getElementById('sleep-latest-awake-pct');
  if (awakePctEl) awakePctEl.textContent = awakeMin ? `${awakePct}%` : '--';
  
  const awakeBarEl = document.getElementById('sleep-latest-awake-bar');
  if (awakeBarEl) awakeBarEl.style.width = awakeMin ? `${awakePct}%` : '0%';
  
  const awakeTimeEl = document.getElementById('sleep-latest-awake-time');
  if (awakeTimeEl) awakeTimeEl.textContent = awakeMin ? `${awakeMin} minutes` : '--';
  
  // REM
  const remPct = stages.rem || 0;
  const remMin = sleep.remMinutes || sleep.remMin || 0;
  const remPctEl = document.getElementById('sleep-latest-rem-pct');
  if (remPctEl) remPctEl.textContent = remMin ? `${remPct}%` : '--';
  
  const remBarEl = document.getElementById('sleep-latest-rem-bar');
  if (remBarEl) remBarEl.style.width = remMin ? `${remPct}%` : '0%';
  
  const remTimeEl = document.getElementById('sleep-latest-rem-time');
  if (remTimeEl) remTimeEl.textContent = remMin ? `${remMin} minutes` : '--';
  
  // Core
  const corePct = stages.core || 0;
  const coreMin = sleep.coreMinutes || sleep.coreMin || 0;
  const corePctEl = document.getElementById('sleep-latest-core-pct');
  if (corePctEl) corePctEl.textContent = coreMin ? `${corePct}%` : '--';
  
  const coreBarEl = document.getElementById('sleep-latest-core-bar');
  if (coreBarEl) coreBarEl.style.width = coreMin ? `${corePct}%` : '0%';
  
  const coreTimeEl = document.getElementById('sleep-latest-core-time');
  if (coreTimeEl) coreTimeEl.textContent = coreMin ? `${coreMin} minutes` : '--';
  
  // Deep
  const deepPct = stages.deep || 0;
  const deepMin = sleep.deepSleepMinutes || sleep.deepSleepMin || 0;
  const deepPctEl = document.getElementById('sleep-latest-deep-pct');
  if (deepPctEl) deepPctEl.textContent = deepMin ? `${deepPct}%` : '--';
  
  const deepBarEl = document.getElementById('sleep-latest-deep-bar');
  if (deepBarEl) deepBarEl.style.width = deepMin ? `${deepPct}%` : '0%';
  
  const deepTimeEl = document.getElementById('sleep-latest-deep-time');
  if (deepTimeEl) deepTimeEl.textContent = deepMin ? `${deepMin} minutes` : '--';
  
  // Notes
  const notesContainer = document.getElementById('sleep-latest-notes-container');
  const notesEl = document.getElementById('sleep-latest-notes');
  if (notesContainer && notesEl) {
    if (sleep.notes) {
      notesEl.textContent = sleep.notes;
      notesContainer.classList.remove('hidden');
    } else {
      notesContainer.classList.add('hidden');
    }
  }
}

function renderSleepStagesChart(sleepData) {
  console.log('=== DEBUG: renderSleepStagesChart() START ===');
  
  try {
    const ctx = document.getElementById('sleep-stages-chart');
    if (!ctx) {
      console.error('DEBUG: sleep-stages-chart canvas element NOT FOUND!');
      return;
    }
    console.log('DEBUG: sleep-stages-chart canvas found');
    
    // Destroy existing chart if exists
    if (charts.sleepStages) {
      console.log('DEBUG: Destroying existing sleepStages chart');
      charts.sleepStages.destroy();
      charts.sleepStages = null;
    }
    
    if (!sleepData || !Array.isArray(sleepData) || sleepData.length === 0) {
      console.log('DEBUG: No sleep data for stages chart');
      return;
    }
    
    const last7Days = sleepData
      .map(d => {
        try {
          return {
            date: d.date,
            deepSleepMinutes: d.deepSleepMinutes !== undefined ? parseInt(d.deepSleepMinutes) :
                             d.deepSleepMin !== undefined ? parseInt(d.deepSleepMin) :
                             d.deep_sleep_minutes !== undefined ? parseInt(d.deep_sleep_minutes) : 0,
            remMinutes: d.remMinutes !== undefined ? parseInt(d.remMinutes) :
                       d.remMin !== undefined ? parseInt(d.remMin) :
                       d.rem_minutes !== undefined ? parseInt(d.rem_minutes) : 0,
            coreMinutes: d.coreMinutes !== undefined ? parseInt(d.coreMinutes) :
                        d.coreMin !== undefined ? parseInt(d.coreMin) :
                        d.core_minutes !== undefined ? parseInt(d.core_minutes) : 0
          };
        } catch (err) {
          console.error('DEBUG: Error parsing sleep record:', d, err);
          return null;
        }
      })
      .filter(d => d && d.date)
      .slice(-7);
    
    if (last7Days.length === 0) {
      console.log('DEBUG: No valid sleep data after filtering');
      return;
    }
    
    charts.sleepStages = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: last7Days.map(d => {
          try {
            return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          } catch (err) {
            return '--';
          }
        }),
        datasets: [
          {
            label: 'Deep Sleep (min)',
            data: last7Days.map(d => d.deepSleepMinutes || 0),
            backgroundColor: '#8b5cf6',
            borderColor: '#8b5cf6',
            borderWidth: 2
          },
          {
            label: 'REM Sleep (min)',
            data: last7Days.map(d => d.remMinutes || 0),
            backgroundColor: '#06b6d4',
            borderColor: '#06b6d4',
            borderWidth: 2
          },
          {
            label: 'Core Sleep (min)',
            data: last7Days.map(d => d.coreMinutes || 0),
            backgroundColor: '#3b82f6',
            borderColor: '#3b82f6',
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            stacked: true,
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
            title: {
              display: true,
              text: 'Minutes',
              color: '#9ca3af'
            }
          },
          x: {
            stacked: true,
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#e5e7eb' }
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb'
          }
        }
      }
    });
    console.log('DEBUG: Sleep stages chart created successfully');
  } catch (err) {
    console.error('DEBUG: Error in renderSleepStagesChart():', err);
    console.error('DEBUG: Stack:', err.stack);
  }
  
  console.log('=== DEBUG: renderSleepStagesChart() END ===');
}

function renderSleepHRVChart(sleepData, vitalsData) {
  console.log('=== DEBUG: renderSleepHRVChart() START ===');
  
  try {
    const ctx = document.getElementById('sleep-hrv-chart');
    if (!ctx) {
      console.error('DEBUG: sleep-hrv-chart canvas element NOT FOUND!');
      return;
    }
    console.log('DEBUG: sleep-hrv-chart canvas found');
    
    // Destroy existing chart if exists
    if (charts.sleepHRV) {
      console.log('DEBUG: Destroying existing sleepHRV chart');
      charts.sleepHRV.destroy();
      charts.sleepHRV = null;
    }
    
    if (!sleepData || !Array.isArray(sleepData) || sleepData.length === 0) {
      console.log('DEBUG: No sleep data for HRV correlation chart');
      return;
    }
    
    // Match sleep data with HRV data by date
    const matchedData = sleepData
      .slice(-14)
      .map(sleep => {
        if (!sleep.date || !vitalsData || !Array.isArray(vitalsData)) return null;
        try {
          const sleepDate = new Date(sleep.date).toISOString().split('T')[0];
          const matchingVital = vitalsData.find(v => v.date === sleepDate);
          const hrv = matchingVital && matchingVital.hrv !== null && matchingVital.hrv !== undefined
            ? parseFloat(matchingVital.hrv)
            : null;
          return {
            date: sleepDate,
            deepSleep: sleep.deepSleepMinutes !== undefined ? parseInt(sleep.deepSleepMinutes) :
                      sleep.deepSleepMin !== undefined ? parseInt(sleep.deepSleepMin) :
                      sleep.deep_sleep_minutes !== undefined ? parseInt(sleep.deep_sleep_minutes) : 0,
            hrv: hrv && !isNaN(hrv) ? hrv : null
          };
        } catch (err) {
          return null;
        }
      })
      .filter(d => d && d.hrv !== null);
    
    console.log('DEBUG: Matched sleep-HRV data points:', matchedData.length);
    
    if (matchedData.length === 0) {
      console.log('DEBUG: No matched sleep-HRV data');
      return;
    }
    
    charts.sleepHRV = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Deep Sleep vs HRV',
            data: matchedData.map(d => ({ x: d.deepSleep, y: d.hrv })),
            backgroundColor: '#8b5cf6',
            borderColor: '#a78bfa',
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
            title: {
              display: true,
              text: 'Deep Sleep (minutes)',
              color: '#9ca3af'
            }
          },
          y: {
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
            title: {
              display: true,
              text: 'HRV (ms)',
              color: '#9ca3af'
            }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#e5e7eb' }
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb',
            callbacks: {
              label: function(context) {
                const dataPoint = matchedData[context.dataIndex];
                return `${dataPoint.date}: ${context.parsed.x} min deep, ${context.parsed.y} ms HRV`;
              }
            }
          }
        }
      }
    });
    console.log('DEBUG: Sleep-HRV chart created successfully');
  } catch (err) {
    console.error('DEBUG: Error in renderSleepHRVChart():', err);
    console.error('DEBUG: Stack:', err.stack);
  }
  
  console.log('=== DEBUG: renderSleepHRVChart() END ===');
}

function renderSleepHistoryTable(sleepData) {
  console.log('=== DEBUG: renderSleepHistoryTable() START ===');
  const tbody = document.getElementById('sleep-history-table');
  
  if (!tbody) {
    console.log('DEBUG: sleep-history-table element NOT FOUND!');
    return;
  }
  
  console.log('DEBUG: Rendering', sleepData.length, 'sleep records');
  console.log('DEBUG: First few records:', sleepData.slice(0, 3).map(s => ({ date: s.date, totalHours: s.totalHours, deepSleepMinutes: s.deepSleepMinutes })));
  
  // Data is already sorted by date descending from loadSleep()
  // No need to reverse again
  
  tbody.innerHTML = sleepData.map(sleep => {
    const deepMin = sleep.deepSleepMinutes || sleep.deepSleepMin || 0;
    const totalHours = sleep.totalHours || sleep.durationHours || sleep.duration || 0;
    const remMin = sleep.remMinutes || sleep.remMin || 0;
    const coreMin = sleep.coreMinutes || sleep.coreMin || 0;
    const awakeMin = sleep.awakeMinutes || sleep.awakeMin || 0;
    const quality = sleep.quality || '--';
    
    const deepColor = deepMin >= 90 ? 'text-green-400' : deepMin >= 60 ? 'text-yellow-400' : 'text-red-400';
    
    return `
      <tr class="border-b border-gray-800 hover:bg-gray-800">
        <td class="p-2">${sleep.date ? new Date(sleep.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}</td>
        <td class="p-2">${totalHours ? Number(totalHours).toFixed(1) : '--'}h</td>
        <td class="p-2 ${deepColor} font-medium">${deepMin || '--'} min</td>
        <td class="p-2">${remMin || '--'} min</td>
        <td class="p-2">${coreMin || '--'} min</td>
        <td class="p-2 ${awakeMin > 0 ? 'text-red-400' : 'text-gray-400'}">${awakeMin || '--'} min</td>
        <td class="p-2">${quality}/10</td>
      </tr>
    `;
  }).join('');
  
  console.log('=== DEBUG: renderSleepHistoryTable() END ===');
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
// Force redeploy Sat Feb 14 09:28:35 EST 2026
// Deployed Sat Feb 14 13:25 EST 2026 - Status Widget Added

// ============================================
// STATUS WIDGET - AT A GLANCE
// ============================================

let statusRefreshInterval = null;
let lastStatusData = null;

// Initialize status widget
function initStatusWidget() {
  console.log('DEBUG: initStatusWidget() called');
  // Load initial data
  loadStatusWidget();
  
  // Set up auto-refresh every 5 minutes
  statusRefreshInterval = setInterval(loadStatusWidget, 5 * 60 * 1000);
  
  // Update "last updated" timestamp every minute
  setInterval(updateLastUpdatedText, 60000);
}

// Load all status data
async function loadStatusWidget() {
  console.log('=== DEBUG: loadStatusWidget() START ===');
  try {
    console.log('DEBUG: Fetching vitals, sleep, protocol, alerts...');
    const [vitals, sleep, protocol, alerts] = await Promise.all([
      apiGet('/api/vitals'),
      apiGet('/api/sleep'),
      apiGet('/api/protocol'),
      apiGet('/api/alerts')
    ]);
    
    console.log('DEBUG: Vitals data:', vitals?.length, 'records', vitals ? 'Type: ' + typeof vitals : 'null');
    console.log('DEBUG: Sleep data:', sleep?.length, 'records');
    console.log('DEBUG: Protocol data:', protocol ? 'present' : 'null');
    console.log('DEBUG: Alerts data:', alerts?.length, 'records');
    
    lastStatusData = { vitals, sleep, protocol, alerts, timestamp: new Date() };
    
    // Ensure vitals is an array before passing to update functions
    const vitalsArray = Array.isArray(vitals) ? vitals : [];
    const sleepArray = Array.isArray(sleep) ? sleep : [];
    
    updateHRVCard(vitalsArray);
    updateSleepCard(sleepArray);
    updateProtocolCard(protocol);
    updateAlertsCard(alerts);
    updateHRVMiniChart(vitalsArray);
    
    updateLastUpdatedText();
    console.log('=== DEBUG: loadStatusWidget() END ===');
  } catch (err) {
    console.error('Status widget load error:', err);
    console.error('Status widget load stack:', err.stack);
  }
}

// Update HRV Card
function updateHRVCard(vitals) {
  console.log('DEBUG: updateHRVCard() called with', vitals?.length, 'records');
  
  const card = document.getElementById('status-hrv-card');
  const valueEl = document.getElementById('status-hrv-value');
  const trendEl = document.getElementById('status-hrv-trend');
  const arrowEl = document.getElementById('status-hrv-arrow');
  const changeEl = document.getElementById('status-hrv-change');
  const statusEl = document.getElementById('status-hrv-status');
  
  if (!card || !valueEl) {
    console.log('DEBUG: updateHRVCard() - Missing DOM elements');
    return;
  }
  
  if (!vitals || vitals.length === 0) {
    console.log('DEBUG: updateHRVCard() - No vitals data');
    valueEl.textContent = '--';
    if (statusEl) statusEl.textContent = 'No data';
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    return;
  }
  
  // Parse string values to numbers
  const parsedVitals = vitals.map(v => ({
    ...v,
    hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null
  }));
  
  console.log('DEBUG: updateHRVCard() - Parsed vitals sample:', parsedVitals.slice(0, 2));
  
  // Sort by date descending
  const sorted = parsedVitals.sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = sorted.find(v => v.hrv !== null && v.hrv !== undefined && !isNaN(v.hrv));
  const previous = sorted.find((v, i) => i > 0 && v.hrv !== null && v.hrv !== undefined && !isNaN(v.hrv));
  
  console.log('DEBUG: updateHRVCard() - Latest HRV:', latest?.hrv, 'Previous HRV:', previous?.hrv);
  
  if (!latest) {
    console.log('DEBUG: updateHRVCard() - No valid HRV found');
    valueEl.textContent = '--';
    if (statusEl) statusEl.textContent = 'No HRV';
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    return;
  }
  
  const hrv = latest.hrv;
  valueEl.textContent = Math.round(hrv);
  console.log('DEBUG: updateHRVCard() - Displaying HRV:', Math.round(hrv));
  
  // Calculate trend
  if (previous && previous.hrv) {
    const change = hrv - previous.hrv;
    const changePct = ((change / previous.hrv) * 100).toFixed(1);
    
    if (change > 5) {
      arrowEl.textContent = '↑';
      trendEl.className = 'flex items-center gap-1 mt-2 text-sm trend-up';
      changeEl.textContent = `+${changePct}%`;
    } else if (change < -5) {
      arrowEl.textContent = '↓';
      trendEl.className = 'flex items-center gap-1 mt-2 text-sm trend-down';
      changeEl.textContent = `${changePct}%`;
    } else {
      arrowEl.textContent = '→';
      trendEl.className = 'flex items-center gap-1 mt-2 text-sm trend-flat';
      changeEl.textContent = '0%';
    }
  } else {
    arrowEl.textContent = '→';
    trendEl.className = 'flex items-center gap-1 mt-2 text-sm trend-flat';
    changeEl.textContent = 'no prev';
  }
  
  // Determine status (simplified - adjust thresholds as needed)
  card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
  
  if (hrv >= 50) {
    card.classList.add('status-green');
    statusEl.textContent = 'Good';
    statusEl.className = 'text-xs mt-1 px-2 py-0.5 rounded-full bg-green-900 text-green-300';
  } else if (hrv >= 35) {
    card.classList.add('status-yellow');
    statusEl.textContent = 'Fair';
    statusEl.className = 'text-xs mt-1 px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300';
  } else {
    card.classList.add('status-red');
    statusEl.textContent = 'Low';
    statusEl.className = 'text-xs mt-1 px-2 py-0.5 rounded-full bg-red-900 text-red-300';
  }
}

// Update Sleep Card
function updateSleepCard(sleep) {
  console.log('DEBUG: updateSleepCard() called with', sleep?.length, 'records');
  
  const card = document.getElementById('status-sleep-card');
  const durationEl = document.getElementById('status-sleep-duration');
  const scoreEl = document.getElementById('status-sleep-score');
  
  if (!card || !durationEl || !scoreEl) {
    console.log('DEBUG: updateSleepCard() - Missing DOM elements');
    return;
  }
  
  if (!sleep || sleep.length === 0) {
    console.log('DEBUG: updateSleepCard() - No sleep data');
    durationEl.textContent = '--';
    scoreEl.textContent = '--';
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    return;
  }
  
  // Get latest sleep entry - map API field names
  const latest = sleep[sleep.length - 1];
  console.log('DEBUG: updateSleepCard() - Latest sleep:', latest);
  
  const hours = latest.totalHours !== undefined ? latest.totalHours : 
                latest.durationHours !== undefined ? latest.durationHours : 
                latest.sleep_hours !== undefined ? parseFloat(latest.sleep_hours) :
                latest.duration || 0;
  const quality = latest.quality !== undefined ? latest.quality : latest.sleep_quality || 0;
  const deepMin = latest.deepSleepMinutes !== undefined ? latest.deepSleepMinutes : 
                  latest.deepSleepMin !== undefined ? latest.deepSleepMin : 
                  latest.deep_sleep_minutes !== undefined ? latest.deep_sleep_minutes : 0;
  
  durationEl.textContent = hours ? hours.toFixed(1) : '--';
  scoreEl.textContent = quality || '--';
  
  console.log('DEBUG: updateSleepCard() - Displaying hours:', hours?.toFixed(1), 'quality:', quality);
  
  // Determine status based on hours and quality
  card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
  
  if (hours >= 7 && quality >= 7 && deepMin >= 90) {
    card.classList.add('status-green');
  } else if (hours >= 6 && quality >= 5 && deepMin >= 60) {
    card.classList.add('status-yellow');
  } else {
    card.classList.add('status-red');
  }
}

// Update Protocol Card
function updateProtocolCard(protocol) {
  const card = document.getElementById('status-protocol-card');
  const dayEl = document.getElementById('status-protocol-day');
  const progressEl = document.getElementById('status-protocol-progress');
  
  if (!protocol) {
    dayEl.textContent = '--';
    progressEl.textContent = '-- of --';
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    return;
  }
  
  // Check if we have valid protocol data with startDate
  if (!protocol.startDate) {
    // Try to get from phase or use defaults
    const currentDay = protocol.currentDay || protocol.day || 25; // Default to Day 25
    const totalDays = protocol.totalDays || 37;
    
    dayEl.textContent = currentDay;
    progressEl.textContent = `${currentDay} of ${totalDays}`;
    
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    const progress = currentDay / totalDays;
    if (progress >= 0.75) {
      card.classList.add('status-green');
    } else if (progress >= 0.25) {
      card.classList.add('status-blue');
    } else {
      card.classList.add('status-yellow');
    }
    return;
  }
  
  // Calculate current day from startDate
  const startDate = new Date(protocol.startDate);
  const today = new Date();
  const dayDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.max(1, dayDiff);
  const totalDays = protocol.totalDays || 37; // Default to extended protocol
  
  dayEl.textContent = currentDay;
  progressEl.textContent = `${currentDay} of ${totalDays}`;
  
  // Determine status based on progress
  card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
  
  const progress = currentDay / totalDays;
  if (progress >= 0.75) {
    card.classList.add('status-green');
  } else if (progress >= 0.25) {
    card.classList.add('status-blue');
  } else {
    card.classList.add('status-yellow');
  }
}

// Update Alerts Card
function updateAlertsCard(alerts) {
  const card = document.getElementById('status-alerts-card');
  const countEl = document.getElementById('status-alerts-count');
  const textEl = document.getElementById('status-alerts-text');
  const badgeEl = document.getElementById('status-alerts-badge');
  
  // Filter active (non-dismissed) alerts
  const activeAlerts = alerts ? alerts.filter(a => !a.dismissed) : [];
  const highPriority = activeAlerts.filter(a => a.priority === 'high');
  
  countEl.textContent = activeAlerts.length;
  
  card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
  
  if (activeAlerts.length === 0) {
    card.classList.add('status-green');
    countEl.className = 'text-4xl font-bold text-accent-green';
    textEl.textContent = 'All clear';
    badgeEl.classList.add('hidden');
  } else if (highPriority.length > 0) {
    card.classList.add('status-red');
    countEl.className = 'text-4xl font-bold text-accent-red';
    textEl.textContent = activeAlerts.length === 1 ? '1 alert' : `${activeAlerts.length} alerts`;
    badgeEl.classList.remove('hidden');
    badgeEl.textContent = 'ACTION';
  } else {
    card.classList.add('status-yellow');
    countEl.className = 'text-4xl font-bold text-accent-yellow';
    textEl.textContent = activeAlerts.length === 1 ? '1 alert' : `${activeAlerts.length} alerts`;
    badgeEl.classList.remove('hidden');
    badgeEl.textContent = 'CHECK';
    badgeEl.className = 'mt-2 px-2 py-0.5 rounded-full bg-accent-yellow text-black text-xs';
  }
}

// Update HRV Mini Chart
function updateHRVMiniChart(vitals) {
  const container = document.getElementById('hrv-mini-chart');
  const statusEl = document.getElementById('hrv-trend-mini-status');
  
  if (!container) return;
  
  if (!vitals || vitals.length === 0) {
    container.innerHTML = Array(7).fill('<div class="flex-1 bg-gray-700 rounded-t" style="height: 30%"></div>').join('');
    if (statusEl) statusEl.textContent = '--';
    return;
  }
  
  // Parse string values to numbers
  const parsedVitals = vitals.map(v => ({
    ...v,
    hrv: v.hrv !== null && v.hrv !== undefined ? parseFloat(v.hrv) : null
  }));
  
  // Get last 7 days of HRV data
  const sorted = parsedVitals
    .filter(v => v.hrv !== null && v.hrv !== undefined && !isNaN(v.hrv))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-7);
  
  if (sorted.length === 0) {
    container.innerHTML = Array(7).fill('<div class="flex-1 bg-gray-700 rounded-t" style="height: 30%"></div>').join('');
    if (statusEl) statusEl.textContent = 'No data';
    return;
  }
  
  // Calculate min/max for scaling
  const values = sorted.map(v => v.hrv);
  const min = Math.min(...values) * 0.9;
  const max = Math.max(...values) * 1.1;
  const range = max - min || 1;
  
  // Generate bars
  const bars = sorted.map((vital, i) => {
    const height = ((vital.hrv - min) / range) * 100;
    const isLatest = i === sorted.length - 1;
    const color = isLatest ? 'bg-primary-500' : 'bg-gray-600';
    return `<div class="flex-1 ${color} rounded-t transition-all duration-500" style="height: ${Math.max(10, height)}%"></div>`;
  });
  
  // Pad to 7 if needed
  while (bars.length < 7) {
    bars.unshift('<div class="flex-1 bg-gray-800 rounded-t" style="height: 10%"></div>');
  }
  
  container.innerHTML = bars.join('');
  
  // Update trend status
  if (statusEl) {
    if (sorted.length >= 2) {
      const first = sorted[0].hrv;
      const last = sorted[sorted.length - 1].hrv;
      const change = last - first;
      
      if (change > 5) {
        statusEl.textContent = '↑ Improving';
        statusEl.className = 'text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300';
      } else if (change < -5) {
        statusEl.textContent = '↓ Declining';
        statusEl.className = 'text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300';
      } else {
        statusEl.textContent = '→ Stable';
        statusEl.className = 'text-xs px-2 py-0.5 rounded-full bg-gray-700';
      }
    } else {
      statusEl.textContent = '--';
    }
  }
}

// Update "last updated" text
function updateLastUpdatedText() {
  const el = document.getElementById('last-updated');
  if (!lastStatusData || !lastStatusData.timestamp) {
    el.textContent = 'Never';
    return;
  }
  
  const diff = Math.floor((new Date() - lastStatusData.timestamp) / 60000);
  
  if (diff < 1) {
    el.textContent = 'Just now';
  } else if (diff < 60) {
    el.textContent = `${diff}m ago`;
  } else {
    const hours = Math.floor(diff / 60);
    el.textContent = `${hours}h ago`;
  }
}

// Refresh status on demand
function refreshStatus() {
  loadStatusWidget();
}

// Clean up interval on page unload
window.addEventListener('beforeunload', () => {
  if (statusRefreshInterval) {
    clearInterval(statusRefreshInterval);
  }
});

// Modify init to include status widget
const originalInit = init;
init = function() {
  originalInit();
  initStatusWidget();
  initProtocolAdherence();
};

// ============================================
// PROTOCOL ADHERENCE TRACKING
// ============================================

// Supplement protocol schedule definition
const PROTOCOL_SCHEDULE = {
  morning_empty_stomach: {
    label: 'Morning (Empty Stomach)',
    time: '07:00',
    supplements: [{ name: 'Allimax', dosage: '1 cap' }]
  },
  breakfast: {
    label: 'Breakfast',
    time: '08:00',
    supplements: [{ name: 'Probiotic', dosage: '1 cap' }]
  },
  lunch: {
    label: 'Lunch',
    time: '12:00',
    supplements: [
      { name: 'Allimax', dosage: '1 cap' },
      { name: 'Neem', dosage: '1 cap' }
    ]
  },
  dinner: {
    label: 'Dinner',
    time: '18:00',
    supplements: [
      { name: 'Allimax', dosage: '1 cap' },
      { name: 'Neem', dosage: '1 cap' }
    ]
  },
  bedtime: {
    label: 'Bedtime',
    time: '22:00',
    supplements: [{ name: 'Allimax', dosage: '1 cap' }]
  }
};

// Total expected doses per day for adherence calculation
const TOTAL_DAILY_DOSES = Object.values(PROTOCOL_SCHEDULE)
  .reduce((sum, slot) => sum + slot.supplements.length, 0);

let adherenceData = null;
let adherenceRefreshInterval = null;

// Initialize protocol adherence tracking
function initProtocolAdherence() {
  loadProtocolAdherence();
  // Refresh every 5 minutes to update countdowns and status
  adherenceRefreshInterval = setInterval(loadProtocolAdherence, 5 * 60 * 1000);
}

// Load protocol adherence data
async function loadProtocolAdherence() {
  try {
    // Fetch today's supplement logs
    const today = new Date().toISOString().split('T')[0];
    const [supplements, symptoms] = await Promise.all([
      apiGet('/api/supplements'),
      apiGet('/api/symptoms')
    ]);
    
    // Filter for today's supplement entries
    const todayLogs = (supplements || []).filter(log => {
      const logDate = new Date(log.createdAt || log.date).toISOString().split('T')[0];
      return logDate === today;
    });
    
    // Also check symptoms for supplement type entries
    const supplementSymptoms = (symptoms || []).filter(s => {
      const sDate = new Date(s.createdAt || s.date).toISOString().split('T')[0];
      return sDate === today && s.type === 'supplement';
    });
    
    adherenceData = {
      todayLogs,
      supplementSymptoms,
      timestamp: new Date()
    };
    
    renderProtocolAdherence();
    renderWeeklyAdherence();
    renderNextDoseCountdown();
    
  } catch (err) {
    console.error('Protocol adherence load error:', err);
  }
}

// Get current time slot based on hour
function getCurrentTimeSlot() {
  const hour = new Date().getHours();
  if (hour < 7) return 'morning_empty_stomach';
  if (hour < 9) return 'breakfast';
  if (hour < 13) return 'lunch';
  if (hour < 19) return 'dinner';
  return 'bedtime';
}

// Check if a time slot has passed
function hasTimeSlotPassed(slotKey) {
  const slot = PROTOCOL_SCHEDULE[slotKey];
  const [slotHour, slotMin] = slot.time.split(':').map(Number);
  const now = new Date();
  const slotTime = new Date();
  slotTime.setHours(slotHour, slotMin, 0, 0);
  // Add 2 hour grace period
  slotTime.setHours(slotTime.getHours() + 2);
  return now > slotTime;
}

// Check if time slot is active (within grace period)
function isTimeSlotActive(slotKey) {
  const slot = PROTOCOL_SCHEDULE[slotKey];
  const [slotHour, slotMin] = slot.time.split(':').map(Number);
  const now = new Date();
  const slotTime = new Date();
  slotTime.setHours(slotHour, slotMin, 0, 0);
  // Grace period: 1 hour before to 2 hours after
  const graceStart = new Date(slotTime.getTime() - 60 * 60 * 1000);
  const graceEnd = new Date(slotTime.getTime() + 2 * 60 * 60 * 1000);
  return now >= graceStart && now <= graceEnd;
}

// Check if supplement was logged for a slot
function isSupplementTaken(slotKey, supplementName) {
  if (!adherenceData) return false;
  
  const { todayLogs, supplementSymptoms } = adherenceData;
  const slot = PROTOCOL_SCHEDULE[slotKey];
  
  // Check supplement logs
  const taken = todayLogs.some(log => {
    const logTime = new Date(log.createdAt || log.date);
    const [slotHour, slotMin] = slot.time.split(':').map(Number);
    const slotTime = new Date();
    slotTime.setHours(slotHour, slotMin, 0, 0);
    
    // Within 3 hours of scheduled time
    const timeDiff = Math.abs(logTime - slotTime) / (1000 * 60 * 60);
    const nameMatch = log.name?.toLowerCase().includes(supplementName.toLowerCase()) ||
                     (supplementName === 'Allimax' && log.name?.toLowerCase().includes('allimax')) ||
                     (supplementName === 'Neem' && log.name?.toLowerCase().includes('neem')) ||
                     (supplementName === 'Probiotic' && log.name?.toLowerCase().includes('probiotic'));
    
    return nameMatch && timeDiff < 3;
  });
  
  if (taken) return true;
  
  // Check symptom logs for supplement type
  return supplementSymptoms.some(s => {
    const sTime = new Date(s.createdAt || s.date);
    const [slotHour, slotMin] = slot.time.split(':').map(Number);
    const slotTime = new Date();
    slotTime.setHours(slotHour, slotMin, 0, 0);
    
    const timeDiff = Math.abs(sTime - slotTime) / (1000 * 60 * 60);
    const notesMatch = s.notes?.toLowerCase().includes(supplementName.toLowerCase()) ||
                      (supplementName === 'Allimax' && s.notes?.toLowerCase().includes('allimax')) ||
                      (supplementName === 'Neem' && s.notes?.toLowerCase().includes('neem')) ||
                      (supplementName === 'Probiotic' && s.notes?.toLowerCase().includes('probiotic'));
    
    return notesMatch && timeDiff < 3;
  });
}

// Get adherence status for a supplement in a slot
function getSupplementStatus(slotKey, supplementName) {
  const taken = isSupplementTaken(slotKey, supplementName);
  const passed = hasTimeSlotPassed(slotKey);
  
  if (taken) {
    return { status: 'taken', icon: '✅', class: 'text-green-500' };
  } else if (passed) {
    return { status: 'missed', icon: '❌', class: 'text-red-500' };
  } else {
    return { status: 'pending', icon: '⚪', class: 'text-gray-400' };
  }
}

// Render protocol adherence checklist
function renderProtocolAdherence() {
  const container = document.getElementById('protocol-adherence-container');
  if (!container) return;
  
  const currentSlot = getCurrentTimeSlot();
  
  let html = `
    <div class="bg-gray-800 rounded-lg p-4 mb-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-semibold text-lg text-white">Today's Protocol</h3>
        <span class="text-xs text-gray-400">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </div>
      <div class="space-y-3">
  `;
  
  Object.entries(PROTOCOL_SCHEDULE).forEach(([key, slot]) => {
    const isCurrent = key === currentSlot;
    const isPassed = hasTimeSlotPassed(key);
    const slotClass = isCurrent ? 'border-l-4 border-blue-500 bg-gray-700' : 
                      isPassed ? 'opacity-75' : '';
    
    html += `
      <div class="p-3 rounded-lg ${slotClass} transition-all">
        <div class="flex justify-between items-center mb-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-200">${slot.label}</span>
            <span class="text-xs text-gray-500">~${slot.time}</span>
          </div>
          ${isCurrent ? '<span class="text-xs bg-blue-600 px-2 py-0.5 rounded-full text-white">NOW</span>' : ''}
        </div>
        <div class="space-y-1 ml-2">
    `;
    
    slot.supplements.forEach(supp => {
      const status = getSupplementStatus(key, supp.name);
      html += `
        <div class="flex items-center justify-between py-1">
          <div class="flex items-center gap-3">
            <span class="text-lg">${status.icon}</span>
            <span class="text-sm ${status.class}">${supp.name} <span class="text-gray-500">(${supp.dosage})</span></span>
          </div>
          <span class="text-xs text-gray-500 capitalize">${status.status}</span>
        </div>
      `;
    });
    
    html += '</div></div>';
  });
  
  html += '</div></div>';
  
  container.innerHTML = html;
}

// Calculate and render weekly adherence
async function renderWeeklyAdherence() {
  const container = document.getElementById('weekly-adherence-container');
  if (!container) return;
  
  try {
    // Fetch last 7 days of logs
    const [supplements, symptoms] = await Promise.all([
      apiGet('/api/supplements'),
      apiGet('/api/symptoms')
    ]);
    
    const today = new Date();
    const weekData = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Count doses for this day
      const dayLogs = (supplements || []).filter(log => {
        const logDate = new Date(log.createdAt || log.date).toISOString().split('T')[0];
        return logDate === dateStr;
      });
      
      const daySupplementSymptoms = (symptoms || []).filter(s => {
        const sDate = new Date(s.createdAt || s.date).toISOString().split('T')[0];
        return sDate === dateStr && s.type === 'supplement';
      });
      
      const totalLogged = dayLogs.length + daySupplementSymptoms.length;
      // Estimate: count unique supplement types logged
      const uniqueSupps = new Set([
        ...dayLogs.map(l => l.name?.toLowerCase()),
        ...daySupplementSymptoms.map(s => s.notes?.toLowerCase())
      ]).size;
      
      weekData.push({
        date: date,
        dateStr: dateStr,
        taken: Math.min(uniqueSupps, TOTAL_DAILY_DOSES),
        total: TOTAL_DAILY_DOSES,
        percentage: Math.round((Math.min(uniqueSupps, TOTAL_DAILY_DOSES) / TOTAL_DAILY_DOSES) * 100)
      });
    }
    
    // Calculate overall weekly adherence
    const totalTaken = weekData.reduce((sum, d) => sum + d.taken, 0);
    const totalExpected = weekData.length * TOTAL_DAILY_DOSES;
    const weeklyPercentage = Math.round((totalTaken / totalExpected) * 100);
    
    // Determine color based on percentage
    let adherenceColor = 'text-red-400';
    let adherenceBg = 'bg-red-900';
    if (weeklyPercentage >= 90) {
      adherenceColor = 'text-green-400';
      adherenceBg = 'bg-green-900';
    } else if (weeklyPercentage >= 70) {
      adherenceColor = 'text-yellow-400';
      adherenceBg = 'bg-yellow-900';
    }
    
    let html = `
      <div class="bg-gray-800 rounded-lg p-4">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-semibold text-white">Weekly Adherence</h3>
          <span class="text-2xl font-bold ${adherenceColor}">${weeklyPercentage}%</span>
        </div>
        
        <!-- Progress bar -->
        <div class="w-full bg-gray-700 rounded-full h-3 mb-4">
          <div class="${adherenceBg} h-3 rounded-full transition-all duration-500" style="width: ${weeklyPercentage}%"></div>
        </div>
        
        <!-- Daily breakdown -->
        <div class="flex justify-between items-end h-16 gap-1">
    `;
    
    weekData.forEach(day => {
      const barColor = day.percentage >= 80 ? 'bg-green-500' : 
                       day.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500';
      const dayLabel = day.date.toLocaleDateString('en-US', { weekday: 'narrow' });
      
      html += `
        <div class="flex-1 flex flex-col items-center gap-1">
          <div class="w-full ${barColor} rounded-t transition-all duration-300" style="height: ${Math.max(20, day.percentage)}%"></div>
          <span class="text-xs text-gray-400">${dayLabel}</span>
        </div>
      `;
    });
    
    html += `
        </div>
        <div class="mt-3 text-center text-sm text-gray-400">
          ${totalTaken} of ${totalExpected} doses taken this week
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
  } catch (err) {
    console.error('Weekly adherence render error:', err);
    container.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-4">
        <p class="text-gray-400 text-center">Unable to load adherence data</p>
      </div>
    `;
  }
}

// Find next scheduled dose
function getNextDose() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  
  const slotOrder = ['morning_empty_stomach', 'breakfast', 'lunch', 'dinner', 'bedtime'];
  
  for (const slotKey of slotOrder) {
    const slot = PROTOCOL_SCHEDULE[slotKey];
    const [slotHour, slotMin] = slot.time.split(':').map(Number);
    
    // Check if any supplement in this slot is not yet taken
    const hasPendingSupp = slot.supplements.some(supp => {
      const status = getSupplementStatus(slotKey, supp.name);
      return status.status === 'pending';
    });
    
    if (hasPendingSupp) {
      const slotTime = new Date();
      slotTime.setHours(slotHour, slotMin, 0, 0);
      
      // If this slot is in the future
      if (slotTime > now) {
        const diffMs = slotTime - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        return {
          slot: slotKey,
          label: slot.label,
          supplements: slot.supplements.filter(s => getSupplementStatus(slotKey, s.name).status === 'pending'),
          hours: diffHours,
          minutes: diffMins,
          timeStr: slot.time
        };
      }
    }
  }
  
  // All doses for today are taken or missed - show tomorrow's first dose
  const tomorrowFirst = PROTOCOL_SCHEDULE['morning_empty_stomach'];
  const tomorrowTime = new Date();
  tomorrowTime.setDate(tomorrowTime.getDate() + 1);
  tomorrowTime.setHours(7, 0, 0, 0);
  
  const diffMs = tomorrowTime - now;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return {
    slot: 'morning_empty_stomach',
    label: 'Tomorrow Morning',
    supplements: tomorrowFirst.supplements,
    hours: diffHours,
    minutes: diffMins,
    timeStr: '07:00',
    isTomorrow: true
  };
}

// Render next dose countdown
function renderNextDoseCountdown() {
  const container = document.getElementById('next-dose-container');
  if (!container) return;
  
  const nextDose = getNextDose();
  if (!nextDose) {
    container.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-4">
        <p class="text-gray-400 text-center">All doses complete for today! 🎉</p>
      </div>
    `;
    return;
  }
  
  const suppNames = nextDose.supplements.map(s => s.name).join(', ');
  const timeText = nextDose.hours > 0 
    ? `${nextDose.hours}h ${nextDose.minutes}m` 
    : `${nextDose.minutes}m`;
  
  container.innerHTML = `
    <div class="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-lg p-4 border border-blue-700">
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-semibold text-blue-200">Next Dose</h3>
        <span class="text-xs bg-blue-700 px-2 py-0.5 rounded text-blue-100">${nextDose.timeStr}</span>
      </div>
      <div class="text-lg font-bold text-white mb-1">${suppNames}</div>
      <div class="text-sm text-blue-300">${nextDose.label}</div>
      <div class="mt-3 flex items-center gap-2">
        <span class="text-2xl">⏰</span>
        <span class="text-xl font-mono font-bold text-white">in ${timeText}</span>
      </div>
      ${nextDose.isTomorrow ? '<div class="mt-2 text-xs text-blue-400">Tomorrow morning</div>' : ''}
    </div>
  `;
}

// Quick log supplement function
async function quickLogSupplement(slotKey, supplementName) {
  try {
    const data = {
      name: supplementName,
      dosage: PROTOCOL_SCHEDULE[slotKey].supplements.find(s => s.name === supplementName)?.dosage || '1 cap',
      time: new Date().toTimeString().slice(0, 5),
      date: new Date().toISOString().split('T')[0],
      taken: true
    };
    
    await apiPost('/api/supplements', data);
    showToast(`${supplementName} logged! ✅`);
    
    // Refresh adherence display
    await loadProtocolAdherence();
    
  } catch (err) {
    console.error('Quick log error:', err);
    showToast('Failed to log supplement');
  }
}

// Refresh adherence on demand
function refreshProtocolAdherence() {
  loadProtocolAdherence();
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('=== DEBUG: DOMContentLoaded - Starting init() ===');
  init().catch(err => console.error('DEBUG: init() failed:', err));
});
