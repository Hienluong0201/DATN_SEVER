const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Product = require("../models/Product");

// GET /api/products (lọc & sắp xếp)
router.get("/", async (req, res) => {
  try {
    const { categoryID, sort, page = 1, limit = 10 } = req.query;

    let filter = {};

    if (categoryID && mongoose.Types.ObjectId.isValid(categoryID)) {
      filter.categoryID = new mongoose.Types.ObjectId(categoryID.trim());
    }

    let sortOption = {};
    if (sort === "price_asc") sortOption.price = 1;
    else if (sort === "price_desc") sortOption.price = -1;

    const skip = (page - 1) * limit;

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await Product.countDocuments(filter);

    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      products,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products (thêm sản phẩm)
router.post("/", async (req, res) => {
  try {
    const { categoryID, name, description, price } = req.body;

    if (!categoryID || !name || !price) {
      return res.status(400).json({ message: "Thiếu dữ liệu cần thiết." });
    }

    const newProduct = new Product({
      categoryID,
      name,
      description,
      price,
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/products/:id (sửa sản phẩm)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryID, name, description, price } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });

    if (categoryID) product.categoryID = categoryID;
    if (name) product.name = name;
    if (description) product.description = description;
    if (price) product.price = price;

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id (xoá sản phẩm)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });

    res.json({ message: "Đã xoá sản phẩm thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
