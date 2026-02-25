// Profanity Filter - Frontend-based with backend updates
// Filters problematic words and common character substitutions

// Backend URL for filter updates (optional)
const FILTER_UPDATE_URL = 'https://raw.githubusercontent.com/YOUR_REPO/main/profanity-filter.json';
const FILTER_CACHE_KEY = 'stormjack_profanity_filter';
const FILTER_UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

// Comprehensive profanity list (default embedded in frontend)
const DEFAULT_FILTER_LIST = {
  version: 1.0,
  lastUpdated: Date.now(),
  words: [
    // Profanity (explicit) - avoiding short words that cause false positives
    'fuck', 'fucking', 'fucked', 'fucker', 'fucks',
    'shit', 'shitty', 'shitting', 'bullshit',
    'asshole', 'arse', 'arsehole', 'dumbass', 'badass',
    'bitch', 'bitchy', 'bitching',
    'damn', 'damned', 'goddamn',
    'crap', 'crappy', 'crapped',
    'piss', 'pissed', 'pissing',
    'dick', 'dickhead', 'dicks',
    'cock', 'cocks', 'cocksucker',
    'pussy', 'pussies',
    'cunt', 'cunts',
    'bastard', 'bastards',
    'whore', 'whores', 'whorehouse',
    'slut', 'sluts', 'slutty',
    
    // Slurs (explicit - these should always be caught)
    'fag', 'faggot', 'fags',
    'dyke', 'dykes',
    'retard', 'retarded', 'retards',
    'nigger', 'niggers', 'nigga', 'niggas',
    'kike', 'kikes',
    'spic', 'spics',
    'chink', 'chinks',
    'wetback', 'wetbacks',
    'towelhead', 'towelheads',
    'cracker', 'crackers',
    'honky', 'honkeys',
    'gook', 'gooks',
    'beaner', 'beaners',
    'raghead', 'ragheads',
    'camel jockey',
    'sand nigger',
    
    // Sexual/explicit (whole words only)
    'porn', 'porno', 'pornography',
    'anal sex', 'oral sex',
    'blowjob', 'blowjobs',
    'handjob', 'handjobs',
    'masturbate', 'masturbating', 'masturbation',
    'orgasm', 'orgasms',
    'cumshot', 'cumshots',
    'dildo', 'dildos',
    'viagra',
    
    // Violence/threats (specific phrases)
    'kill yourself', 'kys',
    'go die', 'die bitch', 'die nigger',
    'rape', 'raped', 'raping', 'rapist',
    'school shooter', 'mass shooting', 'shoot up',
    
    // Drugs (specific)
    'cocaine', 'heroin', 'meth', 'methamphetamine',
    'crack cocaine', 'crystal meth',
    'fentanyl', 'overdose',
    'weed dealer', 'drug dealer', 'selling drugs',
    
    // Spam phrases
    'click here now', 'buy now limited',
    'free money now', 'claim your prize',
    'congratulations you won',
    'nigerian prince',
    
    // Common variations (leet speak)
    'fck', 'fuk', 'fuq', 'fvck', 'phuck', 'f**k', 'f*ck',
    'sht', 'shyt', 'sh1t', 'sh!t', 's**t',
    'azz', 'a$$', 'a**',
    'btch', 'b1tch', 'b!tch', 'biatch', 'beotch', 'b**ch',
    'dck', 'd1ck', 'd!ck', 'dik',
    'c0ck', 'c**k',
    'psy', 'p**sy',
    'cnt', 'c**t', 'cvnt',
    'nigg', 'n1gga', 'n1gg3r', 'nig', 'n***a', 'n***er',
    'fgt', 'f4g', 'fagg0t', 'f**got'
  ],
  
  // Character substitution map (for detecting altered words)
  substitutions: {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '@': 'a',
    '$': 's',
    '!': 'i',
    '+': 't',
    '()': 'o',
    '[]': 'o',
    '<>': 'o',
    '|': 'i',
    '¡': 'i',
    '£': 'e'
  }
};

// Get current filter list (from cache or default)
const getFilterList = () => {
  try {
    // Check if we're in a browser environment
    if (typeof localStorage === 'undefined') {
      console.log('[Filter] localStorage not available, using default filter');
      return DEFAULT_FILTER_LIST;
    }
    
    const cached = localStorage.getItem(FILTER_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      console.log(`[Filter] Loaded ${parsed.words.length} words from cache (v${parsed.version})`);
      return parsed;
    }
  } catch (error) {
    console.error('[Filter] Error loading cached filter:', error);
  }
  
  console.log(`[Filter] Using default filter (${DEFAULT_FILTER_LIST.words.length} words)`);
  return DEFAULT_FILTER_LIST;
};

// Save filter list to cache
const saveFilterList = (filterList) => {
  try {
    localStorage.setItem(FILTER_CACHE_KEY, JSON.stringify(filterList));
    console.log(`[Filter] Saved ${filterList.words.length} words to cache (v${filterList.version})`);
  } catch (error) {
    console.error('[Filter] Error saving filter:', error);
  }
};

// Update filter list from backend
export const updateFilterFromBackend = async () => {
  try {
    console.log('[Filter] Checking for backend updates...');
    
    const response = await fetch(FILTER_UPDATE_URL);
    if (!response.ok) {
      console.log('[Filter] Backend not available, using cached/default filter');
      return;
    }
    
    const newFilter = await response.json();
    
    // Validate format
    if (!newFilter.words || !Array.isArray(newFilter.words)) {
      console.error('[Filter] Invalid filter format from backend');
      return;
    }
    
    // Check if newer version
    const currentFilter = getFilterList();
    if (newFilter.version > currentFilter.version) {
      console.log(`[Filter] Updating from v${currentFilter.version} to v${newFilter.version}`);
      saveFilterList(newFilter);
    } else {
      console.log('[Filter] Backend filter is not newer, keeping current');
    }
  } catch (error) {
    console.error('[Filter] Error updating from backend:', error);
  }
};

// Auto-update on app load (if last update was >24h ago)
export const initFilterAutoUpdate = () => {
  const lastUpdate = localStorage.getItem('stormjack_filter_last_update');
  const now = Date.now();
  
  if (!lastUpdate || now - parseInt(lastUpdate) > FILTER_UPDATE_INTERVAL) {
    console.log('[Filter] Auto-updating from backend...');
    updateFilterFromBackend().then(() => {
      localStorage.setItem('stormjack_filter_last_update', now.toString());
    });
  } else {
    console.log('[Filter] Auto-update not needed yet');
  }
};

// Normalize text by replacing common character substitutions
const normalizeText = (text, substitutions) => {
  let normalized = text.toLowerCase();
  
  // Replace each substitution
  Object.entries(substitutions).forEach(([sub, original]) => {
    const regex = new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    normalized = normalized.replace(regex, original);
  });
  
  // Remove common separators that don't change meaning
  normalized = normalized.replace(/[\s\-_\.]/g, '');
  
  return normalized;
};

// Check if text contains profanity
export const containsProfanity = (text) => {
  const filter = getFilterList();
  const normalized = normalizeText(text, filter.substitutions);
  
  // Check each word in filter
  for (const word of filter.words) {
    const normalizedWord = normalizeText(word, filter.substitutions);
    
    // Use strict word boundaries - only match whole words
    const regex = new RegExp(`\\b${normalizedWord}\\b`, 'i');
    if (regex.test(normalized)) {
      console.log(`[Filter] Detected profanity: "${word}" in "${text}"`);
      return true;
    }
  }
  
  return false;
};

// Censor profanity in text (replace with asterisks)
export const censorText = (text) => {
  if (!text) return text;
  
  try {
    const filter = getFilterList();
    let censored = text;
    
    // Process each profane word
    for (const word of filter.words) {
      try {
        // Escape special regex characters in the word
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Simple word boundary match - whole words only
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
        
        censored = censored.replace(regex, (match) => {
          return '*'.repeat(match.length);
        });
      } catch (err) {
        console.error(`[Filter] Error processing word "${word}":`, err);
      }
    }
    
    return censored;
  } catch (error) {
    console.error('[Filter] Error in censorText:', error);
    return text; // Return original text if filter fails
  }
};

// Get filter statistics
export const getFilterStats = () => {
  const filter = getFilterList();
  return {
    version: filter.version,
    wordCount: filter.words.length,
    lastUpdated: new Date(filter.lastUpdated).toLocaleString(),
    substitutionCount: Object.keys(filter.substitutions).length
  };
};

export default {
  censorText,
  containsProfanity,
  updateFilterFromBackend,
  initFilterAutoUpdate,
  getFilterStats
};
