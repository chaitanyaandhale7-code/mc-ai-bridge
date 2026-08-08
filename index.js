const { WSServer, Version } = require('mcpews');
const fetch = require('node-fetch');
const memory = require('./memory');

const PORT = process.env.PORT || 19134;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const BOT_NAME = 'AI'; // change if you want a different in-game name for it
const TRIGGER = '!ai'; // players type: !ai <message>

if (!GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY environment variable is not set.');
}

const server = new WSServer(PORT);
console.log(`Bridge listening on port ${PORT}`);

// ---------- Startup diagnostic: verify Groq API key + connectivity ----------
(async () => {
  try {
    console.log('[GROQ TEST] Testing API key and connectivity...');
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    });
    if (res.ok) {
      console.log('[GROQ TEST] SUCCESS - key is valid and Groq is reachable.');
    } else {
      const text = await res.text();
      console.log(`[GROQ TEST] FAILED - status ${res.status}: ${text.slice(0, 300)}`);
    }
  } catch (e) {
    console.log('[GROQ TEST] ERROR -', e.message);
  }
})();

let currentSession = null;

server.on('client', ({ session }) => {
  console.log('Minecraft client connected');
  currentSession = session;
  session.sendCommand('say §aAI companion connected!');

  // Keepalive: send a silent command every 15s so the connection doesn't
  // go idle and get dropped by the network before a reply can be sent.
  const keepaliveInterval = setInterval(() => {
    try {
      session.sendCommand('list');
    } catch (e) {
      clearInterval(keepaliveInterval);
    }
  }, 15000);

  session.socket?.on('close', () => clearInterval(keepaliveInterval));

  session.subscribe('PlayerMessage', async (event) => {
    try {
      const { body, version } = event;

      let message, messageType, sender;
      if (body?.message !== undefined) {
        message = body.message;
        messageType = body.type;
        sender = body.sender;
      } else if (body?.properties) {
        message = body.properties.Message;
        messageType = body.properties.MessageType;
        sender = body.properties.Sender;
      } else {
        return; // unknown format, skip safely
      }

      // Ignore non-chat messages and the bot's own messages
      if (messageType !== 'chat') return;
      if (sender === BOT_NAME) return;
      const userText = message.trim();
      if (!userText) return;

      console.log(`${sender} asked: ${userText}`);

      try {
        const reply = await askGroq(sender, userText);
        // Minecraft chat can't handle newlines well - flatten them
        // Also avoid square brackets [ ] in case they're parsed as selector syntax
        const safeReply = reply.replace(/\n+/g, ' ').replace(/[[\]]/g, '').slice(0, 400);
        const cmdString = `say AI: ${safeReply}`;
        console.log(`[SENDING COMMAND] "${cmdString}"`);
        (currentSession || session).sendCommand(cmdString, (response) => {
          console.log('[COMMAND RESPONSE]', JSON.stringify(response));
        });
        console.log(`[REPLY SENT - sendCommand call returned]`);
      } catch (err) {
        console.error('Groq error:', err);
        session.sendCommand(`say [${BOT_NAME}] Sorry, kuch gadbad ho gayi (${err.message})`);
      }
    } catch (outerErr) {
      console.error('PlayerMessage handler error (ignored, server stays alive):', outerErr);
    }
  });
});

async function askGroq(sender, userText) {
  memory.addUserMessage(sender, userText);

  const messages = [
    {
      role: 'system',
      content:
        'You are a friendly AI companion living inside a Minecraft world. ' +
        'Keep replies short (1-3 sentences) since they are shown in Minecraft chat. ' +
        'You can be playful and give advice about building, mining, survival etc.',
    },
    ...memory.getHistory(),
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Groq request timed out after 15s');
    throw e;
  }
  clearTimeout(timeoutId);

  console.log(`[GROQ] response status: ${response.status}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || '...';
  memory.addAiMessage(reply);
  return reply;
}
  
