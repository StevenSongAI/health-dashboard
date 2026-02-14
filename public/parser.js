/**
 * Natural Language Health Data Parser
 * Converts natural language health data into structured API format
 */

/**
 * Main parser function - analyzes input and routes to appropriate parser
 * @param {string} input - Natural language health data
 * @returns {Object} Structured health data object
 */
function parseHealthData(input) {
  const text = input.toLowerCase().trim();
  const today = new Date().toISOString().split('T')[0];
  
  // Try each parser in order
  const parsers = [
    parseVitals,
    parseSleep,
    parseSymptom,
    parseSupplement
  ];
  
  for (const parser of parsers) {
    const result = parser(text);
    if (result) {
      // Add date if not specified in data
      if (!result.date) {
        result.date = today;
      }
      return result;
    }
  }
  
  return null;
}

/**
 * Parse vital signs (HRV, RHR, etc.)
 */
function parseVitals(text) {
  const data = {};
  let hasData = false;
  
  // HRV patterns: "HRV 56ms", "HRV 58", "My HRV is 65ms"
  const hrvPatterns = [
    /hrv\s*(?:is\s*)?(\d+)\s*(?:ms)?/i,
    /(?:my\s+)?hrv[:\s]+(\d+)\s*(?:ms)?/i
  ];
  
  for (const pattern of hrvPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.hrv = parseInt(match[1], 10);
      hasData = true;
      break;
    }
  }
  
  // RHR patterns: "RHR 57", "resting heart rate 57", "RHR: 57"
  const rhrPatterns = [
    /rhr\s*(?:is\s*)?(\d+)/i,
    /(?:resting\s+)?heart\s+rate\s*(?:is\s*)?(\d+)/i
  ];
  
  for (const pattern of rhrPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.rhr = parseInt(match[1], 10);
      hasData = true;
      break;
    }
  }
  
  // Date extraction from text
  let date = null;
  const dateMatch = text.match(/(?:on\s+)?(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    date = dateMatch[1];
  } else if (text.includes('this morning') || text.includes('today')) {
    date = new Date().toISOString().split('T')[0];
  }
  
  if (hasData) {
    return {
      type: 'vitals',
      date: date,
      data: data
    };
  }
  
  return null;
}

/**
 * Parse sleep data
 */
function parseSleep(text) {
  const data = {};
  let hasData = false;
  
  // Duration patterns:
  // "Slept 6.5 hours", "6.5h sleep", "6h 23m sleep"
  const durationPatterns = [
    // "6.5 hours", "6.5h"
    /(\d+(?:\.\d+)?)\s*(?:h(?:ours?)?)/i,
    // "6h 23m", "6 hours 23 minutes"
    /(\d+)\s*h(?:ours?)?\s*(?:and\s*)?(\d+)\s*m/i,
    // "Slept X hours"
    /slept\s+(\d+(?:\.\d+)?)\s*(?:h(?:ours?)?)?/i,
    // "X hours of sleep"
    /(\d+(?:\.\d+)?)\s*(?:h(?:ours?)?)?\s*(?:of\s*)?sleep/i
  ];
  
  // Try hours+minutes pattern first
  const hoursMinutesMatch = text.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hoursMinutesMatch) {
    const hours = parseInt(hoursMinutesMatch[1], 10);
    const minutes = parseInt(hoursMinutesMatch[2], 10);
    data.durationHours = Math.round((hours + minutes / 60) * 100) / 100;
    hasData = true;
  } else {
    const durationMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:h(?:ours?)?|hrs?)/i) ||
                          text.match(/slept\s+(\d+(?:\.\d+)?)/i);
    if (durationMatch) {
      data.durationHours = parseFloat(durationMatch[1]);
      hasData = true;
    }
  }
  
  // Deep sleep patterns: "Deep sleep 45min", "45 min deep sleep"
  const deepSleepMatch = text.match(/deep\s*sleep\s*(\d+)\s*(?:min|m)/i) ||
                         text.match(/(\d+)\s*(?:min|m)\s*(?:of\s*)?deep\s*sleep/i);
  if (deepSleepMatch) {
    data.deepSleepMin = parseInt(deepSleepMatch[1], 10);
    hasData = true;
  }
  
  // Quality patterns: "quality 7/10", "quality: 7", "7/10 quality"
  const qualityMatch = text.match(/quality[:\s]*(\d+)\s*(?:\/\s*10)?/i) ||
                       text.match(/(\d+)\s*\/\s*10\s*(?:quality)?/i);
  if (qualityMatch) {
    data.quality = parseInt(qualityMatch[1], 10);
    hasData = true;
  }
  
  if (hasData) {
    return {
      type: 'sleep',
      data: data
    };
  }
  
  return null;
}

/**
 * Parse symptom data
 */
function parseSymptom(text) {
  // Pattern: "Symptom 3/10", "Symptom level 5", "Symptom severity 7"
  const symptomPattern = /(\w+)\s+(?:(?:level|severity|rating)[:\s]+)?(\d+)\s*(?:\/\s*10)?/i;
  const match = text.match(symptomPattern);
  
  if (match) {
    const symptomName = match[1].toLowerCase();
    const severity = parseInt(match[2], 10);
    
    // Validate it's a known symptom word (exclude common non-symptom words and action words)
    const nonSymptoms = ['my', 'the', 'a', 'an', 'this', 'that', 'it', 'took', 'had', 'got', 'have', 'was', 'is', 'are', 'been'];
    if (!nonSymptoms.includes(symptomName)) {
      return {
        type: 'symptom',
        data: {
          symptom: symptomName,
          severity: severity
        }
      };
    }
  }
  
  return null;
}

/**
 * Parse supplement data
 */
function parseSupplement(text) {
  const data = {};
  let hasData = false;
  
  // Common supplement words to exclude
  const nonSupplements = ['took', 'my', 'the', 'a', 'an', 'some', 'today', 'this', 'morning', 'caps', 'pills', 'tablets'];
  
  // Pattern: "Took 2 Allimax", "3 caps Allimax today"
  const supplementPatterns = [
    // "Took 2 Allimax"
    /(?:took|had|consumed)\s+(\d+)\s*(?:(?:caps?|pills?|tablets?|mg|g)\s+)?(\w+)/i,
    // "3 caps Allimax"
    /(\d+)\s*(?:(?:caps?|pills?|tablets?|mg|g)\s+)?(\w+)(?:\s+today)?/i,
    // "Allimax 2 caps"
    /(\w+)\s+(\d+)\s*(?:caps?|pills?|tablets?|mg|g)?/i
  ];
  
  for (const pattern of supplementPatterns) {
    const match = text.match(pattern);
    if (match) {
      // Determine which capture group is the name vs dose
      let dose, name;
      
      if (pattern.source.includes('took|had|consumed')) {
        dose = parseInt(match[1], 10);
        name = match[2].toLowerCase();
      } else if (pattern.source.includes('caps?.*today')) {
        dose = parseInt(match[1], 10);
        name = match[2].toLowerCase();
      } else {
        // Try to determine which is which based on content
        const first = match[1];
        const second = match[2];
        
        if (!isNaN(parseInt(first, 10)) && isNaN(parseInt(second, 10))) {
          dose = parseInt(first, 10);
          name = second.toLowerCase();
        } else {
          dose = parseInt(second, 10);
          name = first.toLowerCase();
        }
      }
      
      if (!nonSupplements.includes(name) && dose > 0 && dose < 100) {
        data.name = name.charAt(0).toUpperCase() + name.slice(1);
        data.dose = dose;
        hasData = true;
        break;
      }
    }
  }
  
  if (hasData) {
    return {
      type: 'supplement',
      data: data
    };
  }
  
  return null;
}

// ============================================
// TEST CASES
// ============================================

function runTests() {
  const tests = [
    // Test 1: Basic HRV
    {
      input: "HRV 56ms",
      expected: {
        type: 'vitals',
        data: { hrv: 56 }
      }
    },
    // Test 2: HRV with time reference
    {
      input: "HRV 58 this morning",
      expected: {
        type: 'vitals',
        data: { hrv: 58 }
      }
    },
    // Test 3: Multiple vitals
    {
      input: "My HRV is 65ms, RHR 57",
      expected: {
        type: 'vitals',
        data: { hrv: 65, rhr: 57 }
      }
    },
    // Test 4: Sleep duration and quality
    {
      input: "6h 23m sleep, quality 7/10",
      expected: {
        type: 'sleep',
        data: { durationHours: 6.38, quality: 7 }
      }
    },
    // Test 5: Supplement with dose
    {
      input: "Took 2 Allimax",
      expected: {
        type: 'supplement',
        data: { name: 'Allimax', dose: 2 }
      }
    }
  ];
  
  console.log('Running Parser Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    const result = parseHealthData(test.input);
    const success = result && 
                    result.type === test.expected.type &&
                    JSON.stringify(result.data) === JSON.stringify(test.expected.data);
    
    console.log(`Test ${index + 1}: ${success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Input:    "${test.input}"`);
    console.log(`  Expected: ${JSON.stringify(test.expected)}`);
    console.log(`  Got:      ${JSON.stringify(result)}`);
    console.log('');
    
    if (success) {
      passed++;
    } else {
      failed++;
    }
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseHealthData, runTests };
}

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
  window.parseHealthData = parseHealthData;
  window.runTests = runTests;
}

// Auto-run tests in Node.js environment
if (typeof require !== 'undefined' && require.main === module) {
  runTests();
}
