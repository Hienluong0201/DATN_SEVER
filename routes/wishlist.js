const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Wishlist = require("../models/Wishlist");
const User = require('../models/User');
const Product = require("../models/Product");



// GET /api/wishlist?userID=xxx (lấy wishlist của 1 user)
router.get("/", async (req, res) => {
  try {
    const { userID } = req.query;

    if (!userID || !mongoose.Types.ObjectId.isValid(userID)) {
      return res.status(400).json({ message: "Thiếu hoặc sai userID." });
    }

    const wishlist = await Wishlist.find({ userID })
      .populate("productID")
      .populate("userID");

    res.json(wishlist);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/wishlist (thêm vào wishlist)
router.post("/", async (req, res) => {
  try {
    const { userID, productID } = req.body;

    if (!userID || !productID) {
      return res.status(400).json({ message: "Thiếu userID hoặc productID." });
    }

    // Kiểm tra trùng wishlist của user
    const exists = await Wishlist.findOne({ userID, productID });
    if (exists) {
      return res.status(400).json({ message: "Sản phẩm đã có trong wishlist." });
    }

    const newWishlist = new Wishlist({ userID, productID });
    await newWishlist.save();

    res.status(201).json(newWishlist);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/wishlist/:id (xoá mục wishlist theo id)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedItem = await Wishlist.findByIdAndDelete(id);
    if (!deletedItem) {
      return res.status(404).json({ message: "Không tìm thấy mục wishlist." });
    }

    res.json({ message: "Đã xoá khỏi wishlist." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
