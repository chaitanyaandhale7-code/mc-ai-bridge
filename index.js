// mc-ai-bridge v2 — autonomous Minecraft Bedrock player bot
// Connects to your world THROUGH your playit.gg tunnel as a real player,
// and uses Groq to decide what to say / do.

const bedrock = require('bedrock-protocol');
const fetch = require('node-fetch');
const http = require('http');

// ---------- CONFIG (from Railway environment variables) ----------
const SERVER_HOST = process.env.MC_HOST; // e.g. katherine-seniors.tun.ply.gg
const SERVER_PORT = parseInt(process.env.MC_PORT || '19132', 10);
const BOT_USERNAME = process.env.BOT_USERNAME || 'AI_Buddy';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';

if (!SERVER_HOST) {
  console.error('MC_HOST env var is not set! Set it to your playit.gg tunnel address.');
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY env var is not set!');
  process.exit(1);
}

// ---------- Tiny in-memory conversation memory ----------
const memory = [];
function remember(role, content) {
  memory.push({ role, content });
  if (memory.length > 20) memory.shift();
}

// ---------- Groq call ----------
async function askGroq(userMessage) {
  remember('user', userMessage);

  const systemPrompt = `You are an AI playing Minecraft Bedrock as a real in-game player named ${BOT_USERNAME}.
You can chat, and you can move (forward, back, left, right, jump, look around).
Reply with a SHORT, casual, in-character chat message (max 1-2 sentences) responding to the player.
Do not use markdown or emojis excessively. Keep it fun and human-like.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...memory],
      max_tokens: 150,
      temperature: 0.9,
    }),
  });

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "...";
  remember('assistant', reply);
  return reply;
}

// ---------- Connect to Minecraft as a real client ----------
function startBot() {
  console.log(`Connecting to ${SERVER_HOST}:${SERVER_PORT} as "${BOT_USERNAME}"...`);

  const client = bedrock.createClient({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: BOT_USERNAME,
    offline: true, // no Xbox login needed for LAN/local worlds with cheats
  });

  let spawned = false;
  let tickInterval = null;

  client.on('spawn', () => {
    spawned = true;
    console.log('Bot has spawned into the world!');
    sendChat("Hey! I'm online and ready to play. Say !ai <message> to talk to me!");

    // Basic idle "alive" loop — sends movement packets so the bot doesn't
    // get kicked for being AFK, and enables simple move commands later.
    tickInterval = setInterval(() => {
      try {
        client.queue('player_auth_input', {
          pitch: 0,
          yaw: 0,
          head_yaw: 0,
          position: client.entity?.position || { x: 0, y: 0, z: 0 },
          move_vector: { x: 0, z: 0 },
          input_data: [],
          input_mode: 'mouse',
          play_mode: 'normal',
          interact_pitch: 0,
          interact_yaw: 0,
          tick: BigInt(Date.now()),
          delta: { x: 0, y: 0, z: 0 },
          item_stack_request: null,
          block_actions: [],
        });
      } catch (e) {
        // Some server versions differ in exact fields; safe to ignore ticks that fail
      }
    }, 1000);
  });

  client.on('text', async (packet) => {
    if (!spawned) return;
    if (packet.type !== 'chat') return;
    if (packet.source_name === BOT_USERNAME) return; // ignore own messages

    const msg = packet.message || '';
    if (!msg.startsWith('!ai ')) return;

    const userMsg = msg.slice(4).trim();
    console.log(`[chat] ${packet.source_name}: ${userMsg}`);

    try {
      const reply = await askGroq(`${packet.source_name} says: ${userMsg}`);
      sendChat(reply);
    } catch (e) {
      console.error('Groq error:', e.message);
      sendChat("Sorry, my brain lagged for a second!");
    }
  });

  client.on('disconnect', (packet) => {
    console.log('Disconnected from server:', packet);
    cleanup();
    scheduleReconnect();
  });

  client.on('close', () => {
    console.log('Connection closed.');
    cleanup();
    scheduleReconnect();
  });

  client.on('kick', (reason) => {
    console.log('Kicked:', reason);
  });

  client.on('error', (err) => {
    console.error('Client error:', err.message);
  });

  function sendChat(message) {
    try {
      client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: BOT_USERNAME,
        message,
        parameters: [],
        xuid: '',
        platform_chat_id: '',
        filtered_message: '',
      });
    } catch (e) {
      console.error('Failed to send chat:', e.message);
    }
  }

  function cleanup() {
    spawned = false;
    if (tickInterval) clearInterval(tickInterval);
  }
}

let reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log('Reconnecting in 15 seconds...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot();
  }, 15000);
}

startBot();

// ---------- Tiny HTTP server so Railway keeps the service alive ----------
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('mc-ai-bridge v2 running');
  })
  .listen(process.env.PORT || 8080, () => {
    console.log(`Health server listening on port ${process.env.PORT || 8080}`);
  });
