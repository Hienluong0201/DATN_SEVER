const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const DeviceToken = require('../models/DeviceToken');
const { sendExpo } = require('../utils/expoPush');
// Lấy tin nhắn của user
router.get('/', async (req, res) => {
  try {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: 'Thiếu userID' });
    const messages = await Message.find({ userID }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Gửi tin nhắn mới
router.post('/', async (req, res) => {
  try {
    const { userID, sender, text = '', type = 'text', orderInfo = null, productInfo = null } = req.body;
    if (!userID || !sender) {
      return res.status(400).json({ message: 'Thiếu dữ liệu' });
    }

    const message = new Message({
      userID,
      sender,
      text,
      type,
      orderInfo: type === 'order' ? orderInfo : null,
      productInfo: type === 'product' ? productInfo : null
    });
    await message.save();

    // phát socket realtime
    const io = req.app.get('io');
    io.emit('new_message', message);
    (async () => {
  try {
    if (process.env.ENABLE_PUSH === 'false') return;
    if (sender === 'admin') {
      const devices = await DeviceToken.find({ userID: message.userID });
      const tokens = devices.map(d => d.token);
      await sendExpo(tokens, {
        title: 'Admin đã trả lời',
        body: message.text || 'Bạn có tin nhắn mới',
        data: { type: 'chat', userID: String(message.userID) }
      });
    }
  } catch (e) {
    console.error('[push] send failed (POST /messages):', e?.message || e);
  }
})();
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy tin nhắn giữa user và admin
router.get('/between', async (req, res) => {
  try {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: 'Thiếu userID' });

    const messages = await Message.find({
      userID,
      sender: { $in: ['user', 'admin'] }
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy tất cả tin nhắn
router.get('/all', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Gửi tin nhắn trả lời
router.post('/reply', async (req, res) => {
  try {
    const { userID, text, replyToMessageId } = req.body;
    if (!userID || !text) {
      return res.status(400).json({ message: 'Thiếu userID hoặc nội dung tin nhắn' });
    }

    let replyTo = null;
    if (replyToMessageId) {
      const original = await Message.findById(replyToMessageId);
      if (!original) return res.status(404).json({ message: 'Tin nhắn gốc không tồn tại' });
      replyTo = replyToMessageId;
    }

    const replyMessage = new Message({
      userID,
      sender: 'admin',
      text,
      replyTo
    });
    await replyMessage.save();

    // phát socket realtime
    const io = req.app.get('io');
    io.emit('new_message', replyMessage);
    // 👉 PUSH: gửi push cho user khi admin reply
(async () => {
  try {
    if (process.env.ENABLE_PUSH === 'false') return;
    const devices = await DeviceToken.find({ userID: replyMessage.userID });
    const tokens = devices.map(d => d.token);
    await sendExpo(tokens, {
      title: 'Admin đã trả lời',
      body: replyMessage.text || 'Bạn có tin nhắn mới',
      data: { type: 'chat', userID: String(replyMessage.userID) }
    });
  } catch (e) {
    console.error('[push] send failed (/reply):', e?.message || e);
  }
})();
    res.status(201).json(replyMessage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
