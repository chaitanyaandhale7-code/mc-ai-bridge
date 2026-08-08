// Persistent conversation history, saved to a file so it survives restarts/redeploys.
// The file lives on a Railway Volume mounted at /app/data (set up separately),
// so it's not lost when the container restarts.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const FILE_PATH = path.join(DATA_DIR, 'memory.json');
const MAX_TURNS = 20; // how many back-and-forth messages to remember

let history = [];

// Load existing memory on startup, if any
try {
  if (fs.existsSync(FILE_PATH)) {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    history = JSON.parse(raw);
    console.log(`[MEMORY] Loaded ${history.length} messages from ${FILE_PATH}`);
  } else {
    console.log(`[MEMORY] No existing memory file at ${FILE_PATH}, starting fresh.`);
  }
} catch (e) {
  console.log('[MEMORY] Failed to load memory file, starting fresh:', e.message);
  history = [];
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(history), 'utf8');
  } catch (e) {
    console.log('[MEMORY] Failed to save memory file:', e.message);
  }
}

function addUserMessage(sender, message) {
  history.push({ role: 'user', content: `${sender}: ${message}` });
  trim();
  save();
}

function addAiMessage(message) {
  history.push({ role: 'assistant', content: message });
  trim();
  save();
}

function trim() {
  if (history.length > MAX_TURNS * 2) {
    history = history.slice(history.length - MAX_TURNS * 2);
  }
}

function getHistory() {
  return history;
}

function reset() {
  history = [];
  save();
}

module.exports = { addUserMessage, addAiMessage, getHistory, reset };
