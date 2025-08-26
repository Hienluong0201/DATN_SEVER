// routes/video.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Video = require('../models/Video');
const { uploadVideo } = require('../middlewares/upload');

// GET /api/v1/videos (lấy danh sách video cho feed)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const videos = await Video.find({ status: true })
      .populate('userID', 'name email img')
      .populate('products', 'name price image')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Video.countDocuments({ status: true });
    res.json({ videos, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/v1/videos (đăng video)
router.post('/', uploadVideo.single('video'), async (req, res) => {
  try {
    const { userID, caption, products } = req.body;

    if (!userID || !req.file) {
      return res.status(400).json({ message: 'Thiếu userID hoặc video.' });
    }

    const videoData = {
      userID,
      videoURL: req.file.path, // Đường dẫn video từ Cloudinary
      caption,
      products: products ? JSON.parse(products) : [], // Chuyển từ string JSON sang array
    };

    const newVideo = new Video(videoData);
    await newVideo.save();

    const populatedVideo = await Video.findById(newVideo._id)
      .populate('userID', 'name email img')
      .populate('products', 'name price image');

    res.status(201).json(populatedVideo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/v1/videos/:id/like (like/unlike video)
router.put('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { userID } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !userID) {
      return res.status(400).json({ message: 'ID không hợp lệ hoặc thiếu userID.' });
    }

    const video = await Video.findById(id);
    if (!video) {
      return res.status(404).json({ message: 'Không tìm thấy video.' });
    }

    const userIndex = video.likes.indexOf(userID);
    if (userIndex === -1) {
      video.likes.push(userID); // Thêm like
    } else {
      video.likes.splice(userIndex, 1); // Bỏ like
    }

    await video.save();
    res.json({ message: 'Cập nhật lượt thích thành công.', likes: video.likes.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/v1/videos/:id/view (tăng lượt xem)
router.put('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    const video = await Video.findById(id);
    if (!video) {
      return res.status(404).json({ message: 'Không tìm thấy video.' });
    }

    video.views += 1;
    await video.save();
    res.json({ message: 'Tăng lượt xem thành công.', views: video.views });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/v1/videos/:id (xóa video)
// DELETE /api/v1/videos/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const video = await Video.findByIdAndDelete(id);
    if (!video) {
      return res.status(404).json({ message: 'Không tìm thấy video.' });
    }

    // ❌ Bỏ đoạn này đi
    // const publicId = video.videoURL.split('/').pop().split('.')[0];
    // await cloudinary.uploader.destroy(`upload_videos/${publicId}`, { resource_type: 'video' });

    res.json({ message: 'Xóa video thành công.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;