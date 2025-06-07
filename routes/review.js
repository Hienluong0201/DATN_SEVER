// routes/review.js
const express = require('express');
const router = express.Router();
const Review = require('../models/Review');

// 1. Tạo mới một Review
// POST /reviews
router.post('/', async (req, res) => {
  try {
    const { userID, productID, rating, comment, status } = req.body;
    if (!userID || !productID || rating == null) {
      return res.status(400).json({ message: 'Thiếu userID, productID hoặc rating.' });
    }
    const review = new Review({
      userID,
      productID,
      rating,
      comment,
      status
    });
    // Sau khi save
const saved = await review.save();
// Populate cả userID và productID trong một lệnh
await saved.populate(['userID', 'productID']);
res.status(201).json(saved);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. Lấy danh sách tất cả Reviews
// GET /reviews
router.get('/', async (req, res) => {
  try {
    const reviews = await Review.find()
      .sort('-reviewDate')
      .populate('userID')
      .populate('productID');
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. Lấy chi tiết một Review theo id
// GET /reviews/:id
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('userID')
      .populate('productID');
    if (!review) {
      return res.status(404).json({ message: 'Không tìm thấy review.' });
    }
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// 4b. Lấy tất cả Reviews của một Product
// GET /reviews/product/:productID
router.get('/product/:productID', async (req, res) => {
  try {
    const { productID } = req.params;
    const reviews = await Review.find({ productID })
      .sort('-reviewDate')
      .populate('userID')
      .populate('productID');
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// 4. Cập nhật một Review
// PUT /review/:id
router.put('/:id', async (req, res) => {
  try {
    const { rating, comment, status } = req.body;
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Không tìm thấy review.' });
    }

    if (rating != null)   review.rating = rating;
    if (comment !== undefined) review.comment = comment;
    if (status !== undefined)  review.status = status;

    const updated = await review.save();

    // Chỉ gọi populate một lần, truyền array các field cần populate
    await updated.populate(['userID', 'productID']);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// 5. Xóa một Review
// DELETE /reviews/:id
router.delete('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Không tìm thấy review.' });
    }
    await review.remove();
    res.json({ message: 'Xóa review thành công.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
