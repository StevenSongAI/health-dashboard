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
  if (tabName === 'protocol') renderProtocol();
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

// Render Protocol Tab
function renderProtocol() {
  if (!protocolData) return;
  
  const phase = protocolData.phase || {};
  document.getElementById('protocol-phase-name').textContent = phase.name || 'Kill Phase';
  document.getElementById('protocol-phase-dates').textContent = 
    `${phase.startDate || 'Jan 20'} - ${phase.endDate || 'Feb 17'}, 2025`;
  
  // Calculate progress
  const start = new Date(phase.startDate || '2025-01-20');
  const end = new Date(phase.endDate || '2025-02-17');
  const today = new Date();
  const total = end - start;
  const elapsed = today - start;
  const progress = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  
  document.getElementById('phase-progress').textContent = `${progress}%`;
  document.getElementById('phase-progress-bar').style.width = `${progress}%`;
  
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
  
  renderEnergyChart(energy);
  renderSleepChart(sleep);
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
  
  const labels = sleep?.map(s => new Date(s.createdAt).toLocaleDateString()).slice(-14) || [];
  const data = sleep?.map(s => s.hours).slice(-14) || [];
  
  charts.sleep = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Hours Slept',
        data,
        backgroundColor: '#8b5cf6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
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

// Start
init();