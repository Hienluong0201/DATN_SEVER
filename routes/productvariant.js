const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const ProductVariant = require("../models/ProductVariant");

// Lấy tất cả biến thể sản phẩm
router.get("/", async (req, res) => {
  try {
   const populated = await saved.populate("productID");

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
router.post("/", async (req, res) => {
  try {
    const { productID, size, color, stock } = req.body;
    if (!productID || stock === undefined)
      return res.status(400).json({ message: "Thiếu productID hoặc stock." });

    const newVariant = new ProductVariant({ productID, size, color, stock });
    const saved = await newVariant.save();
const populated = await saved.populate("productID");
res.status(201).json(populated);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa biến thể
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { productID, size, color, stock } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID không hợp lệ." });
    }

    const variant = await ProductVariant.findById(id);
    if (!variant) return res.status(404).json({ message: "Không tìm thấy biến thể." });

    if (productID) variant.productID = productID;
    if (size !== undefined) variant.size = size;
    if (color !== undefined) variant.color = color;
    if (stock !== undefined) variant.stock = stock;

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
