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

// Alert System - Check health trends and generate alerts
async function checkAlerts() {
  const alerts = [];
  
  // Fetch vitals and sleep data for trend analysis
  const [vitals, sleep, dailyLogs] = await Promise.all([
    apiGet('/api/vitals'),
    apiGet('/api/sleep'),
    apiGet('/api/daily-logs')
  ]);
  
  // ========== HRV ALERTS ==========
  if (vitals && vitals.length > 0) {
    // Sort by date descending
    const sortedVitals = vitals
      .filter(v => v.hrv !== null && v.hrv !== undefined)
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

// Load HRV Status for Overview - UPDATED FOR APPLE HEALTH
async function loadHRVStatus() {
  console.log('Loading HRV status from /api/vitals...');
  try {
    // Fetch from /api/vitals where Apple Health data is stored
    const vitals = await apiGet('/api/vitals');
    console.log('Vitals data:', vitals?.length, 'records');
    
    if (!vitals || vitals.length === 0) {
      console.log('No vitals data found');
      document.getElementById('hrv-current').textContent = '--';
      document.getElementById('hrv-status').textContent = 'No data';
      document.getElementById('hrv-recommendation').textContent = 'Log your HRV to see recommendations';
      return;
    }
    
    // Sort by date descending and get latest HRV entry
    const sortedVitals = vitals.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestVital = sortedVitals.find(v => v.hrv !== null && v.hrv !== undefined);
    
    console.log('Latest vital:', latestVital);
    
    if (!latestVital) {
      console.log('No HRV data found in vitals');
      document.getElementById('hrv-current').textContent = '--';
      document.getElementById('hrv-status').textContent = 'No data';
      document.getElementById('hrv-recommendation').textContent = 'Log your HRV to see recommendations';
      return;
    }
    
    const hrv = latestVital.hrv;
    const baseline = 61; // Your baseline HRV
    const diff = hrv - baseline;
    const diffPercent = ((diff / baseline) * 100).toFixed(0);
    
    console.log(`HRV: ${hrv}ms, Baseline: ${baseline}ms, Diff: ${diff}ms`);
    
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

// Render Protocol Tab - Enhanced with adherence tracking
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
  
  // Add adherence tracking section if not present
  const scheduleTimeline = document.getElementById('schedule-timeline');
  if (scheduleTimeline) {
    // Check if adherence section already exists
    let adherenceSection = document.getElementById('protocol-adherence-section');
    if (!adherenceSection) {
      adherenceSection = document.createElement('div');
      adherenceSection.id = 'protocol-adherence-section';
      adherenceSection.className = 'mt-6';
      scheduleTimeline.parentElement.insertBefore(adherenceSection, scheduleTimeline);
    }
    
    adherenceSection.innerHTML = `
      <div class="card p-6 mb-6 border-l-4 border-accent-green">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <span>📋</span> Protocol Adherence
        </h3>
        <div id="protocol-tab-next-dose"></div>
        <div id="protocol-tab-adherence-checklist"></div>
        <div id="protocol-tab-weekly-adherence"></div>
      </div>
    `;
    
    // Render adherence in protocol tab
    renderProtocolTabAdherence();
  }
  
  // Schedule timeline
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
  renderHRVTrendChart(vitals);
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

// 30-Day HRV Trend Chart with color-coded points
function renderHRVTrendChart(vitals) {
  const ctx = document.getElementById('hrv-trend-chart');
  if (!ctx) return;
  
  if (charts.hrvTrend) charts.hrvTrend.destroy();
  
  if (!vitals || vitals.length === 0) {
    // Show "No data" message
    return;
  }
  
  // Filter for HRV records only, sort by date ascending, get last 30 days
  const hrvData = vitals
    .filter(v => v.hrv !== null && v.hrv !== undefined)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-30);
  
  if (hrvData.length === 0) {
    return;
  }
  
  // Format dates as MM-DD
  const labels = hrvData.map(v => {
    const date = new Date(v.date);
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  
  const dataValues = hrvData.map(v => v.hrv);
  const baseline = 61;
  
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
      renderSleepDurationChart(sleepData);
      renderDeepSleepTrendChart(sleepData, vitalsData);
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
  if (!sleepData || sleepData.length === 0) {
    console.log('No sleep data available');
    return;
  }
  
  const latest = sleepData[sleepData.length - 1];
  const last7Days = sleepData.slice(-7);
  
  // Last night total - handle different field names
  const totalHours = latest.totalHours || latest.durationHours || latest.duration || 0;
  document.getElementById('sleep-last-total').textContent = `${Number(totalHours).toFixed(1)}h`;
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
  
  // 7-day average quality
  const avgQuality = last7Days.reduce((sum, night) => sum + (parseInt(night.quality) || 0), 0) / last7Days.length;
  const avgQualityEl = document.getElementById('sleep-avg-quality');
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

// 14-Day Sleep Duration Bar Chart with Quality Color Coding
function renderSleepDurationChart(sleepData) {
  const ctx = document.getElementById('sleep-duration-chart');
  if (!ctx) return;
  
  // Destroy existing chart if exists
  if (charts.sleepDuration) {
    charts.sleepDuration.destroy();
  }
  
  // Get last 14 days
  const last14Days = sleepData.slice(-14);
  
  // Prepare labels and data
  const labels = last14Days.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const durations = last14Days.map(d => d.totalHours || 0);
  
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
          callbacks: {
            label: function(context) {
              const hours = context.parsed.y;
              let quality = hours > 7 ? 'Good' : hours >= 6 ? 'Fair' : 'Poor';
              return `${hours.toFixed(1)} hours (${quality})`;
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
}

// Deep Sleep Trend Line Chart with HRV Correlation
function renderDeepSleepTrendChart(sleepData, vitalsData) {
  const ctx = document.getElementById('deep-sleep-trend-chart');
  if (!ctx) return;
  
  // Destroy existing chart if exists
  if (charts.deepSleepTrend) {
    charts.deepSleepTrend.destroy();
  }
  
  // Get last 14 days
  const last14Days = sleepData.slice(-14);
  
  // Prepare labels
  const labels = last14Days.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  
  // Deep sleep data
  const deepSleepData = last14Days.map(d => d.deepSleepMinutes || 0);
  
  // Match with HRV data by date
  const hrvData = last14Days.map(sleep => {
    const sleepDate = new Date(sleep.date).toISOString().split('T')[0];
    const matchingVital = vitalsData?.find(v => v.date === sleepDate);
    return matchingVital ? matchingVital.hrv : null;
  });
  
  // Calculate correlation coefficient for display
  const validPairs = deepSleepData.map((deep, i) => ({ deep, hrv: hrvData[i] }))
    .filter(p => p.hrv !== null && p.deep > 0);
  
  let correlationText = '';
  if (validPairs.length >= 3) {
    const avgDeep = validPairs.reduce((s, p) => s + p.deep, 0) / validPairs.length;
    const avgHrv = validPairs.reduce((s, p) => s + p.hrv, 0) / validPairs.length;
    const numerator = validPairs.reduce((s, p) => s + (p.deep - avgDeep) * (p.hrv - avgHrv), 0);
    const denomDeep = Math.sqrt(validPairs.reduce((s, p) => s + Math.pow(p.deep - avgDeep, 2), 0));
    const denomHrv = Math.sqrt(validPairs.reduce((s, p) => s + Math.pow(p.hrv - avgHrv, 2), 0));
    const correlation = denomDeep > 0 && denomHrv > 0 ? numerator / (denomDeep * denomHrv) : 0;
    
    if (Math.abs(correlation) > 0.5) {
      correlationText = correlation > 0 ? 'Strong positive correlation with HRV' : 'Strong negative correlation with HRV';
    } else if (Math.abs(correlation) > 0.3) {
      correlationText = correlation > 0 ? 'Moderate positive correlation with HRV' : 'Moderate negative correlation with HRV';
    } else {
      correlationText = 'Weak correlation with HRV';
    }
  }
  
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
}

function renderLatestSleep(sleep) {
  if (!sleep) {
    console.log('No latest sleep data available');
    return;
  }
  
  // Sleep times - handle different field names
  const totalHours = sleep.totalHours || sleep.durationHours || sleep.duration || 0;
  document.getElementById('sleep-latest-fell-asleep').textContent = sleep.fellAsleep || sleep.bedtime || '--';
  document.getElementById('sleep-latest-woke-up').textContent = sleep.wokeUp || sleep.waketime || '--';
  document.getElementById('sleep-latest-duration').textContent = `${Number(totalHours).toFixed(1)} hours`;
  
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
// Deployed Sat Feb 14 13:25 EST 2026 - Status Widget Added

// ============================================
// STATUS WIDGET - AT A GLANCE
// ============================================

let statusRefreshInterval = null;
let lastStatusData = null;

// Initialize status widget
function initStatusWidget() {
  // Load initial data
  loadStatusWidget();
  
  // Set up auto-refresh every 5 minutes
  statusRefreshInterval = setInterval(loadStatusWidget, 5 * 60 * 1000);
  
  // Update "last updated" timestamp every minute
  setInterval(updateLastUpdatedText, 60000);
}

// Load all status data
async function loadStatusWidget() {
  try {
    const [vitals, sleep, protocol, alerts] = await Promise.all([
      apiGet('/api/vitals'),
      apiGet('/api/sleep'),
      apiGet('/api/protocol'),
      apiGet('/api/alerts')
    ]);
    
    lastStatusData = { vitals, sleep, protocol, alerts, timestamp: new Date() };
    
    updateHRVCard(vitals);
    updateSleepCard(sleep);
    updateProtocolCard(protocol);
    updateAlertsCard(alerts);
    updateHRVMiniChart(vitals);
    
    updateLastUpdatedText();
  } catch (err) {
    console.error('Status widget load error:', err);
  }
}

// Update HRV Card
function updateHRVCard(vitals) {
  const card = document.getElementById('status-hrv-card');
  const valueEl = document.getElementById('status-hrv-value');
  const trendEl = document.getElementById('status-hrv-trend');
  const arrowEl = document.getElementById('status-hrv-arrow');
  const changeEl = document.getElementById('status-hrv-change');
  const statusEl = document.getElementById('status-hrv-status');
  
  if (!vitals || vitals.length === 0) {
    valueEl.textContent = '--';
    statusEl.textContent = 'No data';
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    return;
  }
  
  // Sort by date descending
  const sorted = vitals.sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = sorted.find(v => v.hrv !== null && v.hrv !== undefined);
  const previous = sorted.find((v, i) => i > 0 && v.hrv !== null && v.hrv !== undefined);
  
  if (!latest) {
    valueEl.textContent = '--';
    statusEl.textContent = 'No HRV';
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    return;
  }
  
  const hrv = latest.hrv;
  valueEl.textContent = Math.round(hrv);
  
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
  const card = document.getElementById('status-sleep-card');
  const durationEl = document.getElementById('status-sleep-duration');
  const scoreEl = document.getElementById('status-sleep-score');
  
  if (!sleep || sleep.length === 0) {
    durationEl.textContent = '--';
    scoreEl.textContent = '--';
    card.className = card.className.replace(/status-(green|yellow|red|blue)/g, '');
    return;
  }
  
  // Get latest sleep entry
  const latest = sleep[sleep.length - 1];
  const hours = latest.totalHours || 0;
  const quality = latest.quality || 0;
  const deepMin = latest.deepSleepMinutes || 0;
  
  durationEl.textContent = hours.toFixed(1);
  scoreEl.textContent = quality;
  
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
  
  // Calculate current day
  const startDate = new Date(protocol.startDate);
  const today = new Date();
  const dayDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.max(1, dayDiff);
  const totalDays = protocol.totalDays || 37; // Default to extended protocol
  
  dayEl.textContent = currentDay;
  progressEl.textContent = `Day ${currentDay} of ${totalDays}`;
  
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
  
  if (!vitals || vitals.length === 0) {
    container.innerHTML = Array(7).fill('<div class="flex-1 bg-gray-700 rounded-t" style="height: 30%"></div>').join('');
    statusEl.textContent = '--';
    return;
  }
  
  // Get last 7 days of HRV data
  const sorted = vitals
    .filter(v => v.hrv !== null && v.hrv !== undefined)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-7);
  
  if (sorted.length === 0) {
    container.innerHTML = Array(7).fill('<div class="flex-1 bg-gray-700 rounded-t" style="height: 30%"></div>').join('');
    statusEl.textContent = 'No data';
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
