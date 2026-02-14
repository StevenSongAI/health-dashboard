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
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
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
  
  // Protocol card
  const protocolOverview = document.getElementById('protocol-overview');
  if (data.protocol?.supplements) {
    protocolOverview.innerHTML = data.protocol.supplements.map(s => `
      <div class="supplement-card p-3 bg-gray-800 rounded-lg">
        <div class="font-medium text-accent-blue">${s.name}</div>
        <div class="text-xs text-gray-400">${s.dosage}</div>
        <div class="text-xs text-gray-500 mt-1">${s.frequency} • ${s.timing.join(', ')}</div>
      </div>
    `).join('');
  }
  
  // Alerts
  const alertsList = document.getElementById('alerts-list');
  if (data.alerts?.length > 0) {
    alertsList.innerHTML = data.alerts.map(a => `
      <div class="flex items-center gap-3 p-3 ${a.dismissed ? 'bg-gray-800 opacity-50' : 'bg-gray-800'} rounded-lg">
        <span class="${a.priority === 'high' ? 'text-accent-red' : a.priority === 'medium' ? 'text-accent-yellow' : 'text-accent-blue'}">
          ${a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🔵'}
        </span>
        <div class="flex-1">
          <div class="text-sm">${a.message}</div>
          ${a.details ? `<div class="text-xs text-gray-400">${a.details}</div>` : ''}
        </div>
      </div>
    `).join('');
  } else {
    alertsList.innerHTML = '<p class="text-gray-400">No active alerts</p>';
  }
}

// Load HRV Status for Overview
async function loadHRVStatus() {
  try {
    // Fetch from /api/vitals where Apple Health data is stored
    const vitals = await apiGet('/api/vitals');
    
    if (!vitals || vitals.length === 0) {
      document.getElementById('hrv-current').textContent = '--';
      document.getElementById('hrv-status').textContent = 'No data';
      document.getElementById('hrv-recommendation').textContent = 'Log your HRV to see recommendations';
      return;
    }
    
    // Sort by date descending and get latest HRV entry
    const sortedVitals = vitals.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestVital = sortedVitals.find(v => v.hrv !== null && v.hrv !== undefined);
    
    if (!latestVital) {
      document.getElementById('hrv-current').textContent = '--';
      document.getElementById('hrv-status').textContent = 'No data';
      document.getElementById('hrv-recommendation').textContent = 'Log your HRV to see recommendations';
      return;
    }
    
    const hrv = latestVital.hrv;
    const baseline = 61; // Your baseline HRV
    const diff = hrv - baseline;
    const diffPercent = ((diff / baseline) * 100).toFixed(0);
    
    // Update HRV display
    document.getElementById('hrv-current').textContent = `${hrv}ms`;
    document.getElementById('hrv-trend').textContent = `${diff >= 0 ? '+' : ''}${diff}ms (${diffPercent}%) vs baseline`;
    
    // Color code
    const hrvElement = document.getElementById('hrv-current');
    if (diff < -10) {
      hrvElement.className = 'text-3xl font-bold text-accent-red';
    } else if (diff < 0) {
      hrvElement.className = 'text-3xl font-bold text-accent-yellow';
    } else {
      hrvElement.className = 'text-3xl font-bold text-accent-green';
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
    
    document.getElementById('hrv-status').textContent = status;
    document.getElementById('hrv-recommendation').textContent = recommendation;
    
    // Update card border
    const card = document.getElementById('hrv-status-card');
    card.className = `card p-6 mb-6 border-l-4 ${cardBorder}`;
    
    // Fetch latest sleep data for deep sleep info
    const sleepData = await apiGet('/api/sleep');
    if (sleepData && sleepData.length > 0) {
      const latestSleep = sleepData.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (latestSleep && latestSleep.deepSleepMin) {
        document.getElementById('hrv-deep-sleep').textContent = `Deep sleep: ${latestSleep.deepSleepMin}min`;
      }
    }
    
  } catch (error) {
    console.error('Error loading HRV status:', error);
    document.getElementById('hrv-status').textContent = 'Error loading data';
  }
}

// Render Protocol Tab
function renderProtocol() {
  if (!protocolData) return;
  
  // Use symptom-based tracking, not day count
  const phaseName = protocolData.phase?.name || 'Kill Phase';
  const status = protocolData.phase?.status || 'Active';
  const daysOnProtocol = protocolData.phase?.daysRemaining || 0;
  
  document.getElementById('protocol-phase-name').textContent = phaseName;
  document.getElementById('protocol-phase-dates').textContent = 
    `Day ${daysOnProtocol} • ${status}`;
  
  // Calculate progress based on symptom improvement, not days
  let progress = 0;
  if (protocolData.symptoms) {
    const bloatingImprovement = protocolData.symptoms.bloating?.improvement || '0%';
    progress = parseInt(bloatingImprovement);
    
    // Show symptom-based progress
    document.getElementById('phase-progress').textContent = `${bloatingImprovement} improved`;
  } else {
    // Fallback to "Ongoing" if no symptom data
    document.getElementById('phase-progress').textContent = 'Ongoing';
    progress = 50; // Show partial bar
  }
  
  document.getElementById('phase-progress-bar').style.width = `${progress}%`;
  
  // Show exit criteria if available
  if (protocolData.exitCriteria && Array.isArray(protocolData.exitCriteria)) {
    const exitCriteriaHtml = `
      <div class="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
        <h4 class="font-semibold text-accent-blue mb-3">Exit Criteria (When to Stop Protocol)</h4>
        <div class="space-y-2">
          ${protocolData.exitCriteria.map(criterion => {
            // Check if criterion is met (basic heuristic)
            const isMet = false; // Will be dynamic later
            return `
              <div class="flex items-start gap-2">
                <span class="text-lg">${isMet ? '✅' : '⏳'}</span>
                <span class="text-sm ${isMet ? 'text-accent-green' : 'text-gray-400'}">${criterion}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="mt-3 text-xs text-gray-500">
          Protocol continues until ALL criteria are met
        </div>
      </div>
    `;
    
    // Insert after progress bar
    const progressBar = document.getElementById('phase-progress-bar').parentElement.parentElement;
    const existingCriteria = progressBar.nextElementSibling;
    if (existingCriteria && existingCriteria.classList.contains('exit-criteria')) {
      existingCriteria.remove();
    }
    progressBar.insertAdjacentHTML('afterend', `<div class="exit-criteria">${exitCriteriaHtml}</div>`);
  }
  
  // Schedule timeline
  const scheduleTimeline = document.getElementById('schedule-timeline');
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
  
  // Supplements list
  const supplementsList = document.getElementById('supplements-list');
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

// Load Symptoms
async function loadSymptoms() {
  const symptoms = await apiGet('/api/symptoms');
  const trends = await apiGet('/api/symptoms/trends');
  
  // Recent symptoms list
  const list = document.getElementById('recent-symptoms-list');
  if (symptoms?.length > 0) {
    list.innerHTML = symptoms.slice(-10).reverse().map(s => `
      <div class="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
        <div>
          <span class="font-medium capitalize">${s.type.replace('_', ' ')}</span>
          <span class="text-xs text-gray-400 ml-2">${new Date(s.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold ${s.severity >= 7 ? 'text-accent-red' : s.severity >= 4 ? 'text-accent-yellow' : 'text-accent-green'}">
            ${s.severity}
          </span>
          <span class="text-xs text-gray-500">/10</span>
        </div>
      </div>
    `).join('');
  }
  
  // Chart
  renderSymptomsChart(trends);
}

function renderSymptomsChart(trends) {
  const ctx = document.getElementById('symptoms-chart');
  if (!ctx) return;
  
  if (charts.symptoms) charts.symptoms.destroy();
  
  const labels = [];
  const datasets = [];
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  
  if (trends && Object.keys(trends).length > 0) {
    // Get all dates
    Object.values(trends).forEach(arr => {
      arr.forEach(item => {
        const date = item.date?.split('T')[0] || item.date;
        if (!labels.includes(date)) labels.push(date);
      });
    });
    labels.sort();
    
    // Create datasets
    Object.entries(trends).forEach(([type, data], idx) => {
      const dataPoints = labels.map(date => {
        const entry = data.find(d => (d.date?.split('T')[0] || d.date) === date);
        return entry ? entry.severity : null;
      });
      
      datasets.push({
        label: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        data: dataPoints,
        borderColor: colors[idx % colors.length],
        backgroundColor: colors[idx % colors.length] + '20',
        tension: 0.4,
        fill: true
      });
    });
  }
  
  charts.symptoms = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9ca3af' } }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af' }
        },
        x: {
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });
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
  const energy = await apiGet('/api/energy');
  const sleep = await apiGet('/api/sleep');
  const vitals = await apiGet('/api/vitals');
  
  renderEnergyChart(energy);
  renderSleepChart(sleep);
  renderHRVChart(vitals);
}

function renderHRVChart(vitals) {
  const ctx = document.getElementById('hrv-chart');
  if (!ctx) return;
  
  if (charts.hrv) charts.hrv.destroy();
  
  if (!vitals || vitals.length === 0) {
    // Show "No data" message
    return;
  }
  
  // Sort by date and get last 30 days
  const sortedVitals = vitals
    .filter(v => v.hrv !== null && v.hrv !== undefined)
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

function renderEnergyChart(energy) {
  const ctx = document.getElementById('energy-chart');
  if (!ctx) return;
  
  if (charts.energy) charts.energy.destroy();
  
  const labels = energy?.map(e => new Date(e.createdAt).toLocaleDateString()).slice(-14) || [];
  const data = energy?.map(e => e.level).slice(-14) || [];
  
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
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 10, grid: { color: '#374151' }, ticks: { color: '#9ca3af' } },
        x: { grid: { display: false }, ticks: { color: '#9ca3af', maxTicksLimit: 7 } }
      }
    }
  });
}

function renderSleepChart(sleep) {
  const ctx = document.getElementById('sleep-chart');
  if (!ctx) return;
  
  if (charts.sleep) charts.sleep.destroy();
  
  if (!sleep || sleep.length === 0) return;
  
  // Handle both Apple Health format (durationHours, date) and manual format (hours, createdAt)
  const sortedSleep = sleep
    .map(s => ({
      date: s.date || new Date(s.createdAt).toISOString().split('T')[0],
      hours: s.durationHours || s.hours || 0,
      deepSleep: s.deepSleepMin || 0
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-14);
  
  const labels = sortedSleep.map(s => s.date.slice(5)); // MM-DD format
  const data = sortedSleep.map(s => s.hours);
  const deepSleepData = sortedSleep.map(s => (s.deepSleep / 60).toFixed(1)); // Convert min to hours
  
  charts.sleep = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Sleep (hrs)',
        data,
        backgroundColor: '#8b5cf6',
        borderRadius: 4
      }, {
        label: 'Deep Sleep (hrs)',
        data: deepSleepData,
        backgroundColor: '#10b981',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9ca3af' } } },
      scales: {
        y: { min: 0, max: 12, grid: { color: '#374151' }, ticks: { color: '#9ca3af' } },
        x: { grid: { display: false }, ticks: { color: '#9ca3af', maxTicksLimit: 7 } }
      }
    }
  });
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
init();// Sleep Tracking Functions
async function loadSleep() {
  try {
    // Fetch sleep data
    const sleepRes = await fetch(`${API_BASE}/api/sleep`);
    const sleepData = await sleepRes.json();
    
    // Fetch vitals for HRV correlation
    const vitalsRes = await fetch(`${API_BASE}/api/vitals`);
    const vitalsData = await vitalsRes.json();
    
    if (sleepData && sleepData.length > 0) {
      renderSleepSummary(sleepData);
      renderLatestSleep(sleepData[sleepData.length - 1]);
      renderSleepStagesChart(sleepData);
      renderSleepHRVChart(sleepData, vitalsData);
      renderSleepHistoryTable(sleepData);
    } else {
      document.getElementById('sleep-history-table').innerHTML = `
        <tr><td colspan="7" class="p-4 text-center text-gray-500">No sleep data yet. Start logging!</td></tr>
      `;
    }
  } catch (error) {
    console.error('Error loading sleep data:', error);
    document.getElementById('sleep-history-table').innerHTML = `
      <tr><td colspan="7" class="p-4 text-center text-red-500">Error loading sleep data</td></tr>
    `;
  }
}

function renderSleepSummary(sleepData) {
  const latest = sleepData[sleepData.length - 1];
  const last7Days = sleepData.slice(-7);
  
  // Last night total
  document.getElementById('sleep-last-total').textContent = `${latest.totalHours.toFixed(1)}h`;
  document.getElementById('sleep-last-date').textContent = new Date(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  // Last night deep sleep
  const deepMin = latest.deepSleepMinutes || 0;
  document.getElementById('sleep-last-deep').textContent = `${deepMin} min`;
  
  // Color code deep sleep target
  const deepTarget = document.getElementById('sleep-deep-target');
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
  
  // Last night quality
  document.getElementById('sleep-last-quality').textContent = latest.quality || '--';
  
  // 7-day average deep sleep
  const avgDeep = last7Days.reduce((sum, night) => sum + (night.deepSleepMinutes || 0), 0) / last7Days.length;
  document.getElementById('sleep-avg-deep').textContent = `${Math.round(avgDeep)} min`;
  
  // Deep sleep deficit
  const deficitEl = document.getElementById('sleep-deep-deficit');
  const deficit = 105 - avgDeep; // 105 is mid-point of 90-120 target
  if (deficit > 0) {
    deficitEl.textContent = `${Math.round(deficit)} min below target`;
    deficitEl.className = 'text-xs text-red-400';
  } else {
    deficitEl.textContent = '✅ Meeting target';
    deficitEl.className = 'text-xs text-green-400';
  }
}

function renderLatestSleep(sleep) {
  // Sleep times
  document.getElementById('sleep-latest-fell-asleep').textContent = sleep.fellAsleep || '--';
  document.getElementById('sleep-latest-woke-up').textContent = sleep.wokeUp || '--';
  document.getElementById('sleep-latest-duration').textContent = `${sleep.totalHours.toFixed(1)} hours`;
  
  // Sleep stages
  const stages = sleep.stages || {};
  
  // Awake
  document.getElementById('sleep-latest-awake-pct').textContent = `${stages.awake || 0}%`;
  document.getElementById('sleep-latest-awake-bar').style.width = `${stages.awake || 0}%`;
  document.getElementById('sleep-latest-awake-time').textContent = `${sleep.awakeMinutes || 0} minutes`;
  
  // REM
  document.getElementById('sleep-latest-rem-pct').textContent = `${stages.rem || 0}%`;
  document.getElementById('sleep-latest-rem-bar').style.width = `${stages.rem || 0}%`;
  document.getElementById('sleep-latest-rem-time').textContent = `${sleep.remMinutes || 0} minutes`;
  
  // Core
  document.getElementById('sleep-latest-core-pct').textContent = `${stages.core || 0}%`;
  document.getElementById('sleep-latest-core-bar').style.width = `${stages.core || 0}%`;
  document.getElementById('sleep-latest-core-time').textContent = `${sleep.coreMinutes || 0} minutes`;
  
  // Deep
  document.getElementById('sleep-latest-deep-pct').textContent = `${stages.deep || 0}%`;
  document.getElementById('sleep-latest-deep-bar').style.width = `${stages.deep || 0}%`;
  document.getElementById('sleep-latest-deep-time').textContent = `${sleep.deepSleepMinutes || 0} minutes`;
  
  // Notes
  if (sleep.notes) {
    document.getElementById('sleep-latest-notes').textContent = sleep.notes;
    document.getElementById('sleep-latest-notes-container').classList.remove('hidden');
  } else {
    document.getElementById('sleep-latest-notes-container').classList.add('hidden');
  }
}

function renderSleepStagesChart(sleepData) {
  const ctx = document.getElementById('sleep-stages-chart');
  if (!ctx) return;
  
  // Destroy existing chart if exists
  if (charts.sleepStages) {
    charts.sleepStages.destroy();
  }
  
  const last7Days = sleepData.slice(-7);
  
  charts.sleepStages = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: last7Days.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
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
        annotation: {
          annotations: {
            deepTarget: {
              type: 'line',
              yMin: 90,
              yMax: 90,
              borderColor: '#10b981',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: 'Deep Sleep Target: 90 min',
                enabled: true,
                position: 'end',
                backgroundColor: '#10b981',
                color: '#ffffff'
              }
            }
          }
        }
      }
    }
  });
}

function renderSleepHRVChart(sleepData, vitalsData) {
  const ctx = document.getElementById('sleep-hrv-chart');
  if (!ctx) return;
  
  // Destroy existing chart if exists
  if (charts.sleepHRV) {
    charts.sleepHRV.destroy();
  }
  
  // Match sleep data with HRV data by date
  const matchedData = sleepData.slice(-14).map(sleep => {
    const sleepDate = new Date(sleep.date).toISOString().split('T')[0];
    const matchingVital = vitalsData.find(v => v.date === sleepDate);
    return {
      date: sleepDate,
      deepSleep: sleep.deepSleepMinutes || 0,
      hrv: matchingVital ? matchingVital.hrv : null
    };
  }).filter(d => d.hrv !== null);
  
  if (matchedData.length === 0) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
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
}

function renderSleepHistoryTable(sleepData) {
  const tbody = document.getElementById('sleep-history-table');
  
  const sortedData = [...sleepData].reverse(); // Most recent first
  
  tbody.innerHTML = sortedData.map(sleep => {
    const deepColor = (sleep.deepSleepMinutes || 0) >= 90 ? 'text-green-400' : (sleep.deepSleepMinutes || 0) >= 60 ? 'text-yellow-400' : 'text-red-400';
    
    return `
      <tr class="border-b border-gray-800 hover:bg-gray-800">
        <td class="p-2">${new Date(sleep.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
        <td class="p-2">${sleep.totalHours.toFixed(1)}h</td>
        <td class="p-2 ${deepColor} font-medium">${sleep.deepSleepMinutes || 0} min</td>
        <td class="p-2">${sleep.remMinutes || 0} min</td>
        <td class="p-2">${sleep.coreMinutes || 0} min</td>
        <td class="p-2 ${(sleep.awakeMinutes || 0) > 0 ? 'text-red-400' : 'text-gray-400'}">${sleep.awakeMinutes || 0} min</td>
        <td class="p-2">${sleep.quality || '--'}/10</td>
      </tr>
    `;
  }).join('');
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
// Force redeploy Sat Feb 14 09:28:35 EST 2026
