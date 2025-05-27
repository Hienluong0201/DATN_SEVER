const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Image = require("../models/Image");

// GET /api/images (lấy tất cả hoặc theo productID)
router.get("/", async (req, res) => {
  try {
    const { productID } = req.query;

    let filter = {};
    if (productID && mongoose.Types.ObjectId.isValid(productID)) {
      filter.productID = productID;
    }

    const images = await Image.find(filter).populate("productID");
    res.json(images);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/images (thêm mới)
router.post("/", async (req, res) => {
  try {
    const { productID, imageURL } = req.body;

    if (!productID || !imageURL || !Array.isArray(imageURL) || imageURL.length === 0) {
      return res.status(400).json({ message: "Thiếu productID hoặc imageURL hợp lệ." });
    }

    const newImage = new Image({
      productID,
      imageURL,
    });

    await newImage.save();
    res.status(201).json(newImage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/images/:id (sửa ảnh)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { productID, imageURL } = req.body;

    const image = await Image.findById(id);
    if (!image) return res.status(404).json({ message: "Không tìm thấy ảnh." });

    if (productID) image.productID = productID;
    if (imageURL && Array.isArray(imageURL) && imageURL.length > 0) image.imageURL = imageURL;

    await image.save();
    res.json(image);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/images/:id (xoá ảnh)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const image = await Image.findByIdAndDelete(id);
    if (!image) return res.status(404).json({ message: "Không tìm thấy ảnh." });

    res.json({ message: "Đã xoá ảnh thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
