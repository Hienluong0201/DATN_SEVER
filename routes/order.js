const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Order = require("../models/Order");
const Payment = require("../models/Payment");



// Lấy tất cả đơn hàng
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userID")
      .populate("paymentID")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy đơn hàng theo userID
router.get("/user/:userID", async (req, res) => {
  try {
    const { userID } = req.params;
    const orders = await Order.find({ userID })
      .populate("paymentID")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy chi tiết đơn hàng theo ID
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userID")
      .populate("paymentID");

    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm đơn hàng mới
router.post("/", async (req, res) => {
  try {
    const { userID, paymentID, shippingAddress, orderStatus, name, sdt } = req.body;

    if (!userID || !paymentID || !shippingAddress || !name || !sdt) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc." });
    }

    const newOrder = new Order({
      userID,
      paymentID,
      shippingAddress,
      orderStatus,
      name,
      sdt
    });

    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cập nhật trạng thái đơn hàng
router.put("/:id", async (req, res) => {
  try {
    const { orderStatus } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });

    if (orderStatus) order.orderStatus = orderStatus;

    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xoá đơn hàng
router.delete("/:id", async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });

    res.json({ message: "Đã xoá đơn hàng thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
