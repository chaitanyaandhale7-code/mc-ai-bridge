const { WSServer, Version } = require('mcpews');
const fetch = require('node-fetch');
const memory = require('./memory');

// Playit hata diya, Railway ka default PORT lagaya
const PORT = process.env.PORT || 8080;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const BOT_NAME = 'AI'; // change if you want a different in-game name for it
const TRIGGER = '!ai'; // players type: !ai <message>

if (!GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY environment variable is not set.');
}

// 🚨 Ye code app ko crash hone se rokega aur Asli Error dikhayega 🚨
process.on('uncaughtException', (err) => {
  console.error('🚨 ASLI ERROR YAHAN HAI (Exception):', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 ASLI ERROR YAHAN HAI (Rejection):', reason);
});

const server = new WSServer(PORT);
console.log(`Bridge listening on port ${PORT}`);

server.on('client', ({ session }) => {
  console.log('Minecraft client connected');
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

    // Ignore non-chat messages and the bot's own messages
    
