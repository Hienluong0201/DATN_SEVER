const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const OrderDetail = require("../models/OrderDetail");

// Lấy tất cả order detail
router.get("/", async (req, res) => {
  try {
    const details = await OrderDetail.find()
      .populate("variantID")
      .populate("orderID")
      .sort({ createdAt: -1 });

    res.json(details);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy order detail theo orderID
router.get("/order/:orderID", async (req, res) => {
  try {
    const { orderID } = req.params;
    const details = await OrderDetail.find({ orderID })
      .populate("variantID")
      .sort({ createdAt: -1 });

    res.json(details);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy chi tiết một order detail theo ID
router.get("/:id", async (req, res) => {
  try {
    const detail = await OrderDetail.findById(req.params.id)
      .populate("variantID")
      .populate("orderID");

    if (!detail)
      return res.status(404).json({ message: "Không tìm thấy chi tiết đơn hàng." });

    res.json(detail);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm mới order detail
router.post("/", async (req, res) => {
  try {
    const { variantID, orderID, quantity, price } = req.body;

    if (!variantID || !orderID || !quantity || !price) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc." });
    }

    const newDetail = new OrderDetail({
      variantID,
      orderID,
      quantity,
      price,
    });

    await newDetail.save();
    res.status(201).json(newDetail);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cập nhật order detail
router.put("/:id", async (req, res) => {
  try {
    const { quantity, price } = req.body;

    const detail = await OrderDetail.findById(req.params.id);
    if (!detail)
      return res.status(404).json({ message: "Không tìm thấy chi tiết đơn hàng." });

    if (quantity !== undefined) detail.quantity = quantity;
    if (price !== undefined) detail.price = price;

    await detail.save();
    res.json(detail);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xoá order detail
router.delete("/:id", async (req, res) => {
  try {
    const detail = await OrderDetail.findByIdAndDelete(req.params.id);
    if (!detail)
      return res.status(404).json({ message: "Không tìm thấy chi tiết đơn hàng." });

    res.json({ message: "Đã xoá chi tiết đơn hàng thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
