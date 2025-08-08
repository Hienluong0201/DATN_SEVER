const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');

router.post('/register', async (req, res) => {
  const { userID, token, platform = 'expo' } = req.body || {};
  if (!userID || !token) return res.status(400).json({ message: 'Thiếu userID/token' });
  await DeviceToken.updateOne({ token }, { userID, token, platform }, { upsert: true });
  res.json({ ok: true });
});

router.post('/unregister', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ message: 'Thiếu token' });
  await DeviceToken.deleteOne({ token });
  res.json({ ok: true });
});

// (Tùy chọn) Endpoint test nhanh cho admin
router.post('/test/:userID', async (req, res) => {
  const { userID } = req.params;
  const { title = 'Test push', body = 'Xin chào!', data = {} } = req.body || {};
  const devices = await DeviceToken.find({ userID });
  const tokens = devices.map(d => d.token);
  const { sendExpo } = require('../utils/expoPush');
  await sendExpo(tokens, { title, body, data });
  res.json({ ok: true, sent: tokens.length });
});
// láy token của user
router.get('/list/:userID', async (req, res) => {
  const { userID } = req.params;
  const devices = await DeviceToken.find({ userID });
  res.json({ count: devices.length, tokens: devices.map(d => d.token) });
});
module.exports = router;
