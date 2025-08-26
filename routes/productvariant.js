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

    // images cũ FE gửi url (ít gặp ở POST)
    let images = [];
    if (req.body.images) {
      if (Array.isArray(req.body.images)) images = req.body.images;
      else images = [req.body.images];
    }

    // ảnh mới upload (file)
    if (req.files && req.files.length > 0) {
      images = images.concat(req.files.map(file => file.path));
    }

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

    // images url cũ FE muốn giữ lại
    let images = [];
    if (req.body.images) {
      if (Array.isArray(req.body.images)) images = req.body.images;
      else images = [req.body.images];
    }

    // file mới upload (cloudinary trả về url)
    if (req.files && req.files.length > 0) {
      images = images.concat(req.files.map(file => file.path));
    }

    // Gán lại images (luôn là array các url)
    variant.images = images;

    // Update các trường khác (trừ images đã xử lý riêng)
    if (req.body.size !== undefined) variant.size = req.body.size;
    if (req.body.color !== undefined) variant.color = req.body.color;
    if (req.body.stock !== undefined) variant.stock = req.body.stock;
    if (req.body.productID !== undefined) variant.productID = req.body.productID;

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

// Cập nhật trạng thái (status) của biến thể
// Ẩn/Hiện biến thể (toggle status)
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ." });
    }

    const variant = await ProductVariant.findById(id);
    if (!variant) {
      return res.status(404).json({ message: "Không tìm thấy biến thể." });
    }

    // Đảo trạng thái (true -> false, false -> true)
    variant.status = !variant.status;
    const updated = await variant.save();

    res.json({
      message: "Cập nhật trạng thái thành công.",
      variant: updated
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
