const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Product = require("../models/Product");
const Review = require('../models/Review');
const Image    = require("../models/Image");   // <-- thêm
// GET /api/products (lọc, sắp xếp, trang, và trả về ảnh)

router.get("/", async (req, res) => {
  try {
    const { categoryID, name, sort, page = 1, limit = 10, status } = req.query;
    const filter = {};

    // 1) Build filter như cũ
    if (categoryID && mongoose.Types.ObjectId.isValid(categoryID.trim())) {
      filter.categoryID = new mongoose.Types.ObjectId(categoryID.trim());
    }
    if (name) {
      filter.name = { $regex: name.trim(), $options: "i" };
    }
    if (status !== undefined) {
      filter.status = status === "true";
    }

    // 2) Build sort & pagination
    const sortOption = {};
    if (sort === "price_asc") sortOption.price = 1;
    else if (sort === "price_desc") sortOption.price = -1;
    const skip = (page - 1) * limit;

    // 3) Lấy products
    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .lean(); // lean để dễ gán thêm thuộc tính

    // 4) Lấy tất cả ảnh của các product này
    const productIds = products.map((p) => p._id);
    const imageDocs = await Image.find({
      productID: { $in: productIds },
    }).lean();

    // 5) Gom nhóm imageURL theo productID
    const host = `${req.protocol}://${req.get("host")}`;
    const imageMap = imageDocs.reduce((acc, img) => {
      const key = img.productID.toString();
      const urls = img.imageURL.map((file) =>
        file.startsWith("http") ? file : `${host}/images/${file}`
      );
      if (!acc[key]) acc[key] = [];
      acc[key].push(...urls);
      return acc;
    }, {});

    // ✅ 6) Lấy average rating từ Review
    const reviewAgg = await Review.aggregate([
      { $match: { productID: { $in: productIds } } },
      {
        $group: {
          _id: "$productID",
          averageRating: { $avg: "$rating" },
        },
      },
    ]);

    const ratingMap = reviewAgg.reduce((acc, item) => {
      acc[item._id.toString()] = item.averageRating;
      return acc;
    }, {});

    // ✅ 7) Gán images và rating vào mỗi product
    products.forEach((p) => {
      const key = p._id.toString();
      p.images = imageMap[key] || [];
      p.averageRating = Math.round((ratingMap[key] || 0) * 10) / 10;
    });

    // 8) Count + trả về
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
    const { categoryID, name, description, price, status } = req.body;

    if (!categoryID || !name || !price) {
      return res.status(400).json({ message: "Thiếu dữ liệu cần thiết." });
    }

    const newProduct = new Product({
      categoryID,
      name,
      description,
      price,
      status,
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
    const { categoryID, name, description, price, status } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });

    if (categoryID) product.categoryID = categoryID;
    if (name) product.name = name;
    if (description) product.description = description;
    if (price) product.price = price;
    if (status !== undefined) product.status = status;

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
    const product = await Product.findByIdAndUpdate(
      id,
      { status: false },   // Soft delete
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });
    res.json({ message: "Đã xoá (mềm) sản phẩm thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
