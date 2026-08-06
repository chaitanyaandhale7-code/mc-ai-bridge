// Simple in-memory conversation history.
// NOTE: Railway restarts the container on every redeploy, so this resets then.
// That's fine for a chat companion - it just means "AI forgets" after a redeploy.

const MAX_TURNS = 12; // how many back-and-forth messages to remember

let history = [];

function addUserMessage(sender, message) {
  history.push({ role: 'user', content: `${sender}: ${message}` });
  trim();
}

function addAiMessage(message) {
  history.push({ role: 'assistant', content: message });
  trim();
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
}

module.exports = { addUserMessage, addAiMessage, getHistory, reset };
