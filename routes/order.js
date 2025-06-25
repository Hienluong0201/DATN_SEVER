const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Cart           = require("../models/Cart");
const Order          = require("../models/Order");
const OrderDetail    = require("../models/OrderDetail");
const Payment        = require("../models/Payment");
const ProductVariant = require("../models/ProductVariant");

// GET /order
// → Lấy tất cả đơn, sort mới nhất, populate user & payment
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

// GET /order/user/:userId
// → Lấy tất cả đơn theo user, mới nhất trước
router.get("/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userID: req.params.userId })
      .populate("paymentID")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /order/:id
// → Lấy chi tiết order (header) và cả items luôn
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userID")
      .populate("paymentID");
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn." });

    // Lấy luôn order details
    const details = await OrderDetail.find({ orderID: order._id })
      .populate({
        path: "variantID",
        populate: { path: "productID" }
      });

    res.json({ order, details });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /order/checkout
 * Flow thanh toán:
 *  - Tạo Payment
 *  - Tạo Order
 *  - Tạo OrderDetail
 *  - Giảm stock
 *  - Xóa những item đã thanh toán khỏi Cart
 */
router.post("/checkout", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      userID,
      paymentInfo,
      shippingAddress,
      orderStatus = "pending",
      name,
      sdt,
      items       // [{ variantID, quantity, price }, …]
    } = req.body;

    if (!userID || !paymentInfo || !shippingAddress || !name || !sdt || !items?.length) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc hoặc items rỗng." });
    }

    // 1. Tạo Payment
    const [newPayment] = await Payment.create([{
      ...paymentInfo,
      createdAt: new Date(),
      userID
    }], { session });

    // 2. Tính tổng tiền
    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // 3. Tạo Order kèm luôn mảng items và totalAmount
    const [newOrder] = await Order.create([{
      userID,
      paymentID:       newPayment._id,
      shippingAddress,
      orderStatus,
      name,
      sdt,
      items,
      totalAmount,
      orderDate:       new Date()
    }], { session });

    // 4. Tạo OrderDetail (nếu bạn vẫn muốn giữ collection riêng)
    const detailsPayload = items.map(i => ({
      orderID:    newOrder._id,
      variantID:  i.variantID,
      quantity:   i.quantity,
      price:      i.price
    }));
    const newDetails = await OrderDetail.insertMany(detailsPayload, { session });

    // 5. Giảm stock
    for (const { variantID, quantity } of items) {
      await ProductVariant.findByIdAndUpdate(
        variantID,
        { $inc: { stock: -quantity } },
        { session }
      );
    }

    // 6. Xóa khỏi Cart những variant đã mua
    const variantIds = items.map(i => i.variantID);
    await Cart.deleteMany({ userID, productVariant: { $in: variantIds } }, { session });

    // 7. Commit
    await session.commitTransaction();
    session.endSession();

    // 8. Trả về client
    res.status(201).json({
      order:      newOrder,
      payment:    newPayment,
      details:    newDetails,
      cart:       []   // để frontend clear giỏ
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
});

// PUT /order/:id
// → Cập nhật trạng thái đơn
router.put("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn." });
    if (req.body.orderStatus) order.orderStatus = req.body.orderStatus;
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /order/:id
// → Xóa 1 order (và tùy bạn có muốn xóa detail kèm theo)
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Xóa OrderDetail trước
    await OrderDetail.deleteMany({ orderID: req.params.id }, { session });
    // Xóa Order
    const order = await Order.findByIdAndDelete(req.params.id, { session });
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Không tìm thấy đơn." });
    }
    await session.commitTransaction();
    session.endSession();
    res.json({ message: "Đã xoá đơn và chi tiết thành công." });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
});
// Hủy đơn hàng (chỉ khi orderStatus là 'pending')
router.put("/:id/cancel", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
    }

    if (order.orderStatus !== "pending") {
      return res.status(400).json({ message: "Chỉ có thể hủy đơn khi trạng thái là 'pending'." });
    }

    order.orderStatus = "cancelled";
    await order.save();

    res.json({ message: "Đã hủy đơn hàng thành công.", order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;
