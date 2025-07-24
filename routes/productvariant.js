const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const ProductVariant = require("../models/ProductVariant");
const { uploadImage } = require("../middlewares/upload");
// Lấy tất cả biến thể sản phẩm
router.get("/", async (req, res) => {
  try {
    const variants = await ProductVariant.find().populate("productID");
    res.json(variants);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Lấy tất cả biến thể theo productID
// GET /productvariant/by-product/:productID
router.get("/byproduct/:productID", async (req, res) => {
  try {
    const { productID } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productID)) {
      return res.status(400).json({ message: "productID không hợp lệ." });
    }
    const variants = await ProductVariant.find({ productID }).populate("productID");
    res.json(variants);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Lấy 1 biến thể theo ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ." });
    }
    const variant = await ProductVariant.findById(id).populate("productID");
    if (!variant) return res.status(404).json({ message: "Không tìm thấy biến thể." });
    res.json(variant);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm biến thể mới
router.post("/", uploadImage.array("images", 5), async (req, res) => {
  try {
    const { productID, size, color, stock } = req.body;
    if (!productID || stock === undefined)
      return res.status(400).json({ message: "Thiếu productID hoặc stock." });

    // Lấy các link ảnh đã up lên Cloudinary
    const images = req.files ? req.files.map(file => file.path) : [];

    const newVariant = new ProductVariant({ productID, size, color, stock, images });
    const saved = await newVariant.save();
    const populated = await saved.populate("productID");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa biến thể
router.put("/:id", uploadImage.array("images", 5), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ." });
    }

    const variant = await ProductVariant.findById(id);
    if (!variant) return res.status(404).json({ message: "Không tìm thấy biến thể." });

    // Nếu có ảnh mới upload
    if (req.files && req.files.length > 0) {
      variant.images = req.files.map(file => file.path);
    } else if (req.body.images) {
      // Nếu gửi mảng images (giữ lại ảnh cũ, hoặc bỏ bớt ảnh)
      // Nếu FE gửi về là string (1 ảnh) thì convert về array
      variant.images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    }

    // Update các trường khác
    Object.assign(variant, req.body);
    const updated = await variant.save();
    await updated.populate("productID");
    res.json(updated);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Xóa biến thể
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ." });
    }
    const deleted = await ProductVariant.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Không tìm thấy biến thể." });
    res.json({ message: "Đã xóa biến thể thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
