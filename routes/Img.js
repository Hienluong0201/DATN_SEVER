// routes/images.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Image = require("../models/Image");
const { uploadImage,uploadVideo } = require('../middlewares/upload'); // Đúng path file export uploadImage của bạn

// GET /api/images?productID=...
router.get("/", async (req, res) => {
  try {
    const { productID } = req.query;
    const filter = {};

    if (productID) {
      if (!mongoose.Types.ObjectId.isValid(productID)) {
        return res.status(400).json({ message: "productID không hợp lệ." });
      }
      filter.productID = new mongoose.Types.ObjectId(productID);
    }

    const images = await Image.find(filter)
      .populate({ path: "productID", select: "name" });

    res.json(images);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/images
router.post("/", async (req, res) => {
  try {
    const { productID, imageURL, videoURL = [] } = req.body;

    if (!productID || !mongoose.Types.ObjectId.isValid(productID)) {
      return res.status(400).json({ message: "productID không hợp lệ." });
    }
    if (
      !Array.isArray(imageURL) ||
      imageURL.length === 0 ||
      imageURL.some((url) => typeof url !== "string")
    ) {
      return res.status(400).json({ message: "imageURL phải là mảng các chuỗi." });
    }
    if (videoURL && (!Array.isArray(videoURL) || videoURL.some((url) => typeof url !== "string"))) {
      return res.status(400).json({ message: "videoURL phải là mảng các chuỗi." });
    }

    const newImage = await Image.create({
      productID: new mongoose.Types.ObjectId(productID),
      imageURL,
      videoURL,
    });

    res.status(201).json(newImage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  '/upload-video',
  uploadVideo.array('videos', 3), // Có thể đổi '3' tuỳ số lượng tối đa cho phép
  async (req, res) => {
    try {
      const { productID } = req.body;

      // Kiểm tra productID hợp lệ
      if (!productID || !mongoose.Types.ObjectId.isValid(productID)) {
        return res.status(400).json({ message: 'productID không hợp lệ.' });
      }

      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ message: 'Chưa có video nào được upload.' });
      }

      // Lấy đường dẫn video trả về từ Cloudinary
      const videoURL = files.map((file) => file.path);

      // Có thể tạo mới hoặc update record. Ví dụ tạo mới:
      const newRecord = await Image.create({
        productID,
        imageURL: [],
        videoURL,
      });

      res.status(201).json(newRecord); // trả về cả link video trong response
    } catch (err) {
      res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
  }
);
// routes/images.js
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { productID, imageURL } = req.body;

    // Tạo object chỉ bao gồm các field sẽ update
    const updates = {};
    if (productID && mongoose.Types.ObjectId.isValid(productID)) {
      updates.productID = mongoose.Types.ObjectId(productID);
    }
    if (
      Array.isArray(imageURL) &&
      imageURL.length > 0 &&
      imageURL.every(u => typeof u === "string")
    ) {
      updates.imageURL = imageURL;
    }

    // Dùng $set để chỉ set mỗi các trường trên, _id sẽ không bị chạm tới
    const updated = await Image.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Không tìm thấy ảnh." });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// DELETE /api/images/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "id không hợp lệ." });
    }

    const deleted = await Image.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy ảnh." });
    }

    res.json({ message: "Đã xoá ảnh thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  "/upload",
  uploadImage.array("images", 5), // Tối đa 5 ảnh/lần
  async (req, res) => {
    try {
      const { productID } = req.body;
      // Kiểm tra productID hợp lệ
      if (!productID || !mongoose.Types.ObjectId.isValid(productID)) {
        return res.status(400).json({ message: "productID không hợp lệ." });
      }

      // Kiểm tra và lấy url ảnh từ Cloudinary
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ message: "Chưa có ảnh nào được upload." });
      }
      const imageURL = files.map((file) => file.path); // Chỉ map nếu files tồn tại

      const newImage = await Image.create({
        productID,
        imageURL,
      });

      res.status(201).json(newImage);
    } catch (err) {
      console.error("Lỗi upload:", err); // Log chi tiết lỗi
      res.status(500).json({ message: "Lỗi server: " + err.message });
    }
  }
);
module.exports = router;
