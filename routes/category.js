const express = require("express");
const router = express.Router();
const Category = require("../models/Category");
const Product = require("../models/Product");
// GET /api/categories (lấy tất cả + lọc theo status)
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};

    if (status !== undefined) {
      filter.status = status === 'true';
    }

    const categories = await Category.find(filter);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/categories (thêm mới)
router.post("/", async (req, res) => {
  try {
    const { name, description, status } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Tên danh mục là bắt buộc." });
    }

    const newCategory = new Category({ name, description, status });
    await newCategory.save();

    res.status(201).json(newCategory);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/categories/:id (sửa)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Không tìm thấy danh mục." });
    }

    if (name) category.name = name;
    if (description) category.description = description;
    if (status !== undefined) category.status = status;

    await category.save();
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/categories/:id (xoá)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({ message: "Không tìm thấy danh mục." });
    }

    res.json({ message: "Đã xoá danh mục thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// PATCH /api/categories/:id/status  (Ẩn/Hiện danh mục + sản phẩm trong đó)
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // true = hiện, false = ẩn

    if (typeof status !== "boolean") {
      return res.status(400).json({ message: "Status phải là true hoặc false." });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Không tìm thấy danh mục." });
    }

    // Cập nhật trạng thái category
    category.status = status;
    await category.save();

    // Đồng bộ tất cả sản phẩm trong category
    await Product.updateMany(
      { categoryID: id },
      { status }
    );

    res.json({
      message: status
        ? "✅ Danh mục và sản phẩm đã được hiện để bán."
        : "🚫 Danh mục và sản phẩm đã bị ẩn/ngừng bán.",
      category
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
