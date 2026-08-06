const { WSServer, Version } = require('mcpews');
const fetch = require('node-fetch');
const memory = require('./memory');
const http = require('http');

const PORT = process.env.PORT || 8080;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const BOT_NAME = 'AI';
const TRIGGER = '!ai';

if (!GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY environment variable is not set.');
}

// Safety nets to catch any unexpected errors
process.on('uncaughtException', (err) => {
  console.error('🚨 UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED REJECTION:', reason);
});

// Create HTTP server so Railway doesn't kill the deployment
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Minecraft AI Bridge is running smoothly!\n');
});

// Attach WSServer to the HTTP server
const wss = new WSServer({ server });

server.listen(PORT, () => {
  console.log(`Bridge & HTTP server listening on port ${PORT}`);
});

wss.on('client', ({ session }) => {
  console.log('Minecraft client connected!');
  session.sendCommand('say §aAI companion connected!');

  session.subscribe('PlayerMessage', async (event) => {
    const { body, version } = event;

    let message, messageType, sender;
    if (version === Version.V1_1_0) {
      message = body.message;
      messageType = body.type;
      sender = body.sender;
    } else {
      message = body.properties.Message;
      messageType = body.properties.MessageType;
      sender = body.properties.Sender;
    }

    // Ignore messages that don't start with the trigger
    if (!message || !message.startsWith(TRIGGER)) return;
    const prompt = message.slice(TRIGGER.length).trim();
    if (!prompt) return;

    console.log(`[${sender || 'Player'}]: ${prompt}`);
    
    try {
      session.sendCommand(`say Thinking...`);
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150
        })
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'No response from AI.';
      
      const cleanReply = reply.replace(/\n/g, ' ');
      session.sendCommand(`say ${BOT_NAME}: ${cleanReply}`);

    } catch (err) {
      console.error('Groq API Error:', err);
      session.sendCommand(`say Error getting AI response.`);
    }
  });
});
    
