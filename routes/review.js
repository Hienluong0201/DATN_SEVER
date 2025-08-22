// routes/review.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Review = require('../models/Review');
const { uploadImage } = require('../middlewares/upload');
// 1. Tạo mới một Review
// POST /reviews 
// POST /reviews
// POST /reviews
router.post('/', uploadImage.array('images'), async (req, res) => {
  console.log('🔥 ĐÃ VÀO ROUTE /review');
  try {
    const { userID, productID, rating, comment, status } = req.body;

    if (!userID || !productID || rating == null) {
      return res.status(400).json({ message: 'Thiếu userID, productID hoặc rating.' });
    }
    if (!mongoose.Types.ObjectId.isValid(userID) || !mongoose.Types.ObjectId.isValid(productID)) {
      return res.status(400).json({ message: 'userID hoặc productID không hợp lệ.' });
    }

    // Chặn tạo trùng ở tầng app (bổ sung cho unique index)
    const existed = await Review.findOne({ userID, productID });
    if (existed) {
      return res.status(409).json({ message: 'Bạn đã đánh giá sản phẩm này rồi.' });
    }

    const imageUrls = req.files?.map(file => file.path) || [];
    const review = new Review({ userID, productID, rating, comment, status, images: imageUrls });

    const saved = await review.save();
    await saved.populate(['userID', 'productID']);
    return res.status(201).json(saved);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Bạn chỉ được tạo 1 review cho mỗi sản phẩm.' });
    }
    return res.status(500).json({ message: err.message });
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
// PUT /reviews/:id
router.put('/:id', uploadImage.array('images'), async (req, res) => {
  try {
    const { id } = req.params;
    const { userID, rating, comment, status } = req.body; // nên lấy từ auth: req.user._id

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'review id không hợp lệ.' });
    }

    // (Tuỳ chọn) Kiểm tra quyền sở hữu trước — nếu bạn có auth, so sánh với req.user._id
    const current = await Review.findById(id).select('userID editCount');
    if (!current) return res.status(404).json({ message: 'Không tìm thấy review.' });
    if (!userID || current.userID.toString() !== userID) {
      return res.status(403).json({ message: 'Bạn không có quyền sửa review này.' });
    }

    // Chuẩn bị field được phép sửa
    const setFields = {};
    if (rating != null) setFields.rating = rating;
    if (comment !== undefined) setFields.comment = comment;
    if (status !== undefined) setFields.status = status;

    if (req.files?.length) {
      setFields.images = req.files.map(f => f.path);
    }

    // Atomic update: chỉ update khi còn lượt (editCount < 1)
    const updated = await Review.findOneAndUpdate(
      { _id: id, userID, editCount: { $lt: 1 } },
      {
        $set: setFields,
        $inc: { editCount: 1 },
        $currentDate: { lastEditedAt: true }
      },
      { new: true }
    ).populate(['userID', 'productID']);

    if (!updated) {
      const latest = await Review.findById(id).select('editCount userID');
      if (!latest) return res.status(404).json({ message: 'Không tìm thấy review.' });
      if (latest.editCount >= 1) {
        return res.status(403).json({ message: 'Bạn đã hết lượt sửa review (chỉ được sửa 1 lần).' });
      }
      return res.status(403).json({ message: 'Bạn không có quyền sửa review này.' });
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: err.message });
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
// GET /reviews/product/:productID/average-rating
router.get('/product/:productID/average-rating', async (req, res) => {
  try {
    const { productID } = req.params;

    // Kiểm tra ObjectId hợp lệ
    if (!mongoose.Types.ObjectId.isValid(productID)) {
      return res.status(400).json({ message: "productID không hợp lệ" });
    }

    const result = await Review.aggregate([
      {
        $match: {
          productID: new mongoose.Types.ObjectId(productID),
          status: true // chỉ tính review đã được duyệt
        }
      },
      {
        $group: {
          _id: "$productID",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (result.length === 0) {
      return res.json({ averageRating: 0, totalReviews: 0 });
    }

    res.json({
      averageRating: Math.round(result[0].averageRating * 10) / 10, // Làm tròn 1 chữ số
      totalReviews: result[0].totalReviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Ẩn/hiện một review (chỉ cập nhật status)
// PATCH /reviews/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'review id không hợp lệ.' });
    }

    if (typeof status !== 'boolean') {
      return res.status(400).json({ message: 'status phải là true hoặc false.' });
    }

    const updated = await Review.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate(['userID', 'productID']);

    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy review.' });
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});


module.exports = router;
