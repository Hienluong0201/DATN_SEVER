const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const sendEmail = require("../utils/sendEmail");
const Cart           = require("../models/Cart");
const Order          = require("../models/Order");
const Payment        = require("../models/Payment");
const ProductVariant = require("../models/ProductVariant");
const Voucher        = require("../models/Voucher");

// GET /order
// → Lấy tất cả đơn, sort mới nhất, populate user, payment, voucher, và variant->product
// GET /order?limit=10&page=1&search=abc
router.get("/", async (req, res) => {
  try {
    // Lấy query, set default nếu không truyền
    let { limit = 10, page = 1, search = "" } = req.query;
    limit = Math.max(parseInt(limit) || 10, 1);
    page = Math.max(parseInt(page) || 1, 1);

    // Tạo filter tìm kiếm (theo _id, tên, sdt)
    const filter = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        ...(search.length === 24 ? [{ _id: search }] : []),
        { name: regex },
        { sdt: regex },
        // Nếu muốn mở rộng: tìm theo email
        // { "userID.email": regex },
        // { shippingAddress: regex }
      ];
    }

    // Đếm tổng số lượng đơn thỏa mãn điều kiện
    const total = await Order.countDocuments(filter);

    // Lấy dữ liệu phân trang, populate các trường liên quan
    const orders = await Order.find(filter)
      .populate("userID")
      .populate("paymentID")
      .populate({ path: "items.variantID", populate: { path: "productID" } })
      .populate("voucher")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ orders, total });
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
      .populate({ path: "items.variantID", populate: { path: "productID" } })
      .populate("voucher")
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
      .populate("paymentID")
      .populate({ path: "items.variantID", populate: { path: "productID" } })
      .populate("voucher");
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn." });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /order/checkout
 * Flow thanh toán:
 *  - Tạo Payment
 *  - Tạo Order với items, totalAmount, discountAmount, finalTotal, voucher
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
      items,         // [{ variantID, quantity, price }]
      voucherCode    // (nếu có)
    } = req.body;

    if (!userID || !paymentInfo || !shippingAddress || !name || !sdt || !items?.length) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc hoặc items rỗng." });
    }

    // Tính tổng tiền gốc
    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let discountAmount = 0;
    let voucherId = null;

    // Xử lý voucher
    if (voucherCode) {
      const voucher = await Voucher.findOne({ code: voucherCode.trim().toUpperCase(), isActive: true });
      if (!voucher) throw new Error('Voucher không hợp lệ hoặc đã hết hạn');

      const now = new Date();
      if (now < voucher.validFrom || now > voucher.validTo) throw new Error('Voucher chưa đến ngày sử dụng hoặc đã hết hạn');
      if (voucher.usedCount >= voucher.usageLimit) throw new Error('Voucher đã đạt giới hạn sử dụng');
      if (totalAmount < voucher.minOrderValue) throw new Error(`Đơn tối thiểu phải từ ${voucher.minOrderValue}`);

      // Tính tiền giảm
      discountAmount = voucher.discountType === 'percent'
        ? totalAmount * (voucher.discountValue / 100)
        : voucher.discountValue;
      voucherId = voucher._id;

      // Cập nhật usage
      voucher.usedCount += 1;
      if (voucher.usedCount >= voucher.usageLimit) voucher.isActive = false;
      await voucher.save({ session });
    }

    const finalTotal = Math.max(0, totalAmount - discountAmount);

    // Tạo Payment với số tiền phải thanh toán
    const [newPayment] = await Payment.create([{
      ...paymentInfo,
      amount: finalTotal,
      createdAt: new Date(),
      userID
    }], { session });

    // Tạo Order
    const [newOrder] = await Order.create([{
      userID,
      paymentID:      newPayment._id,
      shippingAddress,
      orderStatus,
      name,
      sdt,
      items,
      totalAmount,
      discountAmount,
      finalTotal,
      voucher:        voucherId,
      orderDate:      new Date()
    }], { session });

    // Giảm stock
    for (const { variantID, quantity } of items) {
      await ProductVariant.findByIdAndUpdate(
        variantID,
        { $inc: { stock: -quantity } },
        { session }
      );
    }

    // Xóa khỏi Cart
    const variantIds = items.map(i => i.variantID);
    await Cart.deleteMany({ userID, productVariant: { $in: variantIds } }, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ order: newOrder, payment: newPayment });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: err.message });
  }
});

// PUT /order/:id
// → Cập nhật trạng thái đơn; nếu hủy thì hoàn tác tồn kho
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Tìm đơn hàng và populate userID để lấy email
    const order = await Order.findById(req.params.id)
      .populate("userID", "email")
      .session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Không tìm thấy đơn." });
    }

    const oldStatus = order.orderStatus;
    const newStatus = req.body.orderStatus;

    // Kiểm tra trạng thái hợp lệ
    const validStatuses = ["pending", "processing", "shipped", "completed", "cancelled"];
    if (newStatus && !validStatuses.includes(newStatus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Trạng thái không hợp lệ." });
    }

    if (newStatus && newStatus !== oldStatus) {
      order.orderStatus = newStatus;

      // Nếu chuyển sang hủy, hoàn kho
      if (newStatus === "cancelled" && oldStatus !== "cancelled") {
        for (const item of order.items) {
          await ProductVariant.findByIdAndUpdate(
            item.variantID,
            { $inc: { stock: item.quantity } },
            { session }
          );
        }
      }

      // Lưu đơn hàng
      await order.save({ session });

      // Gửi email cho khách hàng
      const statusMessages = {
        pending: "Đơn hàng của bạn đang được xử lý.",
        processing: "Đơn hàng của bạn đang được chuẩn bị.",
        shipped: "Đơn hàng của bạn đã được gửi đi.",
        completed: "Đơn hàng của bạn đã hoàn thành.",
        cancelled: "Đơn hàng của bạn đã bị hủy."
      };

      await sendEmail({
        to: order.userID.email,
        subject: `Cập nhật trạng thái đơn hàng #${order._id}`,
        text: `Kính gửi ${order.name},\n\nĐơn hàng #${order._id} của bạn đã được cập nhật sang trạng thái: **${newStatus}**.\n${statusMessages[newStatus]}\n\nCảm ơn bạn đã mua sắm với chúng tôi!`,
        html: `
          <h2>Kính gửi ${order.name},</h2>
          <p>Đơn hàng <b>#${order._id}</b> của bạn đã được cập nhật sang trạng thái: <b>${newStatus}</b>.</p>
          <p>${statusMessages[newStatus]}</p>
          <p>Cảm ơn bạn đã mua sắm với chúng tôi!</p>
        `
      });
    } else {
      // Nếu không thay đổi trạng thái, chỉ lưu đơn hàng
      await order.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json(order);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
});

// DELETE /order/:id
// → Xóa 1 order
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findByIdAndDelete(req.params.id, { session });
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Không tìm thấy đơn." });
    }
    await session.commitTransaction();
    session.endSession();
    res.json({ message: "Đã xoá đơn thành công." });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
