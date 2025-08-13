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
// Tăng số lượng trong giỏ
router.patch("/:id/increase", async (req, res) => {
  try {
    const { id } = req.params;
    const cartItem = await Cart.findById(id);
    if (!cartItem)
      return res.status(404).json({ message: "Không tìm thấy item." });

    const variant = await ProductVariant.findById(cartItem.productVariant);
    if (!variant)
      return res.status(404).json({ message: "Không tìm thấy variant." });

    if (variant.stock < cartItem.soluong + 1)
      return res.status(400).json({ message: "Không đủ tồn kho." });

    cartItem.soluong += 1;
    await cartItem.save();
    res.json(cartItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Giảm số lượng trong giỏ
router.patch("/:id/decrease", async (req, res) => {
  try {
    const { id } = req.params;
    const cartItem = await Cart.findById(id);
    if (!cartItem)
      return res.status(404).json({ message: "Không tìm thấy item." });

    // Nếu số lượng sẽ giảm về 0 thì xoá luôn item
    if (cartItem.soluong <= 1) {
      await Cart.findByIdAndDelete(id);
      return res.json({ message: "Đã xoá item khỏi giỏ." });
    }

    // Ngược lại giảm 1 đơn vị
    cartItem.soluong -= 1;
    await cartItem.save();
    res.json(cartItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm sản phẩm vào giỏ (KHÔNG trừ tồn kho)
router.post("/", async (req, res) => {
  try {
    const { userID, productVariant, soluong } = req.body;

    if (!userID || !productVariant || !soluong || soluong <= 0) {
      return res.status(400).json({ message: "Thiếu dữ liệu hoặc số lượng không hợp lệ." });
    }

    const variant = await ProductVariant.findById(productVariant).select("stock");
    if (!variant) return res.status(404).json({ message: "Không tìm thấy variant." });

    // Số lượng đã có trong giỏ cho user + variant này
    const existing = await Cart.findOne({ userID, productVariant }).select("soluong");
    const existingQty = existing?.soluong ?? 0;

    const maxAddable = variant.stock - existingQty;
    if (maxAddable <= 0) {
      return res.status(409).json({
        code: "OUT_OF_STOCK_FOR_CART",
        message: "Bạn đã thêm tối đa theo tồn kho.",
        maxAddable: 0
      });
    }
    if (soluong > maxAddable) {
      return res.status(409).json({
        code: "EXCEEDS_STOCK",
        message: `Chỉ có thể thêm tối đa ${maxAddable} sản phẩm nữa.`,
        maxAddable
      });
    }

    // Cộng dồn hoặc tạo mới
    if (existing) {
      existing.soluong += soluong;
      await existing.save();
      return res.json({ message: "Đã cập nhật số lượng.", cartItem: existing });
    }

    const newCartItem = new Cart({ userID, productVariant, soluong });
    await newCartItem.save();
    return res.status(201).json(newCartItem);
  } catch (err) {
    // Phòng trường hợp race tạo trùng (do unique index)
    if (err.code === 11000) {
      return res.status(409).json({
        code: "DUPLICATE_ITEM",
        message: "Sản phẩm đã có trong giỏ, vui lòng thử lại."
      });
    }
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
