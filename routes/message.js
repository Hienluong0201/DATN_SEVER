const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Lấy tin nhắn của user
router.get('/', async (req, res) => {
  try {
    const { userID } = req.query;
    if (!userID) return res.status(400).json({ message: 'Thiếu userID' });
    const messages = await Message.find({ userID }).sort({ timestamp: 1 }); // sort theo thời gian tăng dần
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Gửi tin nhắn mới
router.post('/', async (req, res) => {
  try {
    const { userID, sender, text } = req.body;
    if (!userID || !sender || !text) {
      return res.status(400).json({ message: 'Thiếu dữ liệu' });
    }
    const message = new Message({ userID, sender, text });
    await message.save();
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/between', async (req, res) => {
  const { userID } = req.query;
  if (!userID) return res.status(400).json({ message: 'Thiếu userID' });

  // Lấy tin nhắn giữa user và admin (sender là 'user' hoặc 'admin')
  const messages = await Message.find({
    userID,
    sender: { $in: ['user', 'admin'] }
  }).sort({ timestamp: 1 });

  res.json(messages);
});

// Lấy tất cả tin nhắn (từ tất cả user)
router.get('/all', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 }); // Lấy tất cả tin nhắn, sort theo thời gian
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/reply', async (req, res) => {
  try {
    const { userID, text, replyToMessageId } = req.body;
    if (!userID || !text) {
      return res.status(400).json({ message: 'Thiếu userID hoặc nội dung tin nhắn' });
    }
    if (replyToMessageId) {
      const originalMessage = await Message.findById(replyToMessageId);
      if (!originalMessage) {
        return res.status(404).json({ message: 'Tin nhắn gốc không tồn tại' });
      }
    }
    const replyMessage = new Message({
      userID,
      sender: 'admin',
      text,
      replyTo: replyToMessageId || null
    });
    await replyMessage.save();
    res.status(201).json(replyMessage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
