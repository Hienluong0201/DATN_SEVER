const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Cart = require("../models/Cart");
const ProductVariant = require("../models/ProductVariant");

// Lấy giỏ hàng của user
router.get("/:userID", async (req, res) => {
  try {
    const { userID } = req.params;

    const cartItems = await Cart.find({ userID })
      .populate({
        path: "productVariant",
        populate: { path: "productID" }
      });

    res.json(cartItems);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm sản phẩm vào giỏ (KHÔNG trừ tồn kho)
router.post("/", async (req, res) => {
  try {
    const { userID, productVariant, soluong } = req.body;

    if (!userID || !productVariant || !soluong)
      return res.status(400).json({ message: "Thiếu dữ liệu." });

    const variant = await ProductVariant.findById(productVariant);
    if (!variant)
      return res.status(404).json({ message: "Không tìm thấy variant." });

    if (variant.stock < soluong)
      return res.status(400).json({ message: "Không đủ tồn kho." });

    // Kiểm tra nếu sản phẩm đã có trong giỏ thì cộng dồn
    const existingCartItem = await Cart.findOne({ userID, productVariant });
    if (existingCartItem) {
      existingCartItem.soluong += soluong;
      await existingCartItem.save();
      return res.json({ message: "Đã cập nhật số lượng.", cartItem: existingCartItem });
    }

    // Thêm mới
    const newCartItem = new Cart({ userID, productVariant, soluong });
    await newCartItem.save();

    res.status(201).json(newCartItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cập nhật số lượng trong giỏ (KHÔNG trừ tồn kho)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { soluong } = req.body;

    const cartItem = await Cart.findById(id);
    if (!cartItem)
      return res.status(404).json({ message: "Không tìm thấy item." });

    const variant = await ProductVariant.findById(cartItem.productVariant);
    if (!variant)
      return res.status(404).json({ message: "Không tìm thấy variant." });

    if (variant.stock < soluong)
      return res.status(400).json({ message: "Không đủ tồn kho." });

    cartItem.soluong = soluong;
    await cartItem.save();

    res.json(cartItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xoá item khỏi giỏ (KHÔNG cộng tồn kho — vì chưa từng trừ)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const cartItem = await Cart.findById(id);
    if (!cartItem)
      return res.status(404).json({ message: "Không tìm thấy item." });

    await Cart.findByIdAndDelete(id);

    res.json({ message: "Xoá item thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
