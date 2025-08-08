const { Expo } = require('expo-server-sdk');
const expo = new Expo();

async function sendExpo(tokens, { title, body, data }) {
  if (!tokens?.length) return;
  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('[push] expo error:', err?.message || err);
    }
  }
}

module.exports = { sendExpo };
