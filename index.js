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

server.on('client', ({ session }) => {
  console.log('Minecraft client connected');
  session.sendCommand('say §aAI companion connected!');

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
      if (!message || !message.startsWith(TRIGGER)) return;

      const userText = message.slice(TRIGGER.length).trim();
      if (!userText) return;

      console.log(`${sender} asked: ${userText}`);

      try {
        const reply = await askGroq(sender, userText);
        // Minecraft chat can't handle newlines well - flatten them
        const safeReply = reply.replace(/\n+/g, ' ').slice(0, 400);
        session.sendCommand(`say [${BOT_NAME}] ${safeReply}`);
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

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || '...';
  memory.addAiMessage(reply);
  return reply;
    }
          
