const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const sendEmail = require("../utils/sendEmail");
const Cart           = require("../models/Cart");
const Order          = require("../models/Order");
const Payment        = require("../models/Payment");
const ProductVariant = require("../models/ProductVariant");
const Voucher        = require("../models/Voucher");
const OrderDetail    = require("../models/OrderDetail");
const crypto = require("crypto");
const axios = require("axios");
require('dotenv').config(); 
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const cron = require('node-cron');

// Chạy mỗi 15 phút
cron.schedule('*/15 * * * *', async () => { // chạy mỗi 15 phút
  console.log('[CRON] Đang kiểm tra và huỷ các đơn ZaloPay pending quá 15 phút...');

  const now = Date.now();
  const FIFTEEN_MIN = 15 * 60 * 1000;

  // 1. Lấy tất cả đơn pending
  let orders = await Order.find({ orderStatus: "pending" }).populate("paymentID");

  // 2. Lọc lại đơn có paymentMethod là ZaloPay
  orders = orders.filter(order =>
    order.paymentID && order.paymentID.paymentMethod === "ZaloPay"
  );

  // 3. Lọc đơn quá 15 phút
  const ordersToCancel = orders.filter(order =>
    now - new Date(order.createdAt).getTime() >= FIFTEEN_MIN
  );

  for (const order of ordersToCancel) {
    console.log("[CRON] Chuẩn bị huỷ đơn:", order._id);
    order.orderStatus = "cancelled";
    await order.save();
    console.log("[CRON] Đã huỷ xong đơn:", order._id);

    // Hoàn kho nếu có items
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(
          item.variantID,
          { $inc: { stock: item.quantity } }
        );
      }
    }

    console.log(`[CRON] Đã huỷ đơn hàng #${order._id} do pending quá 15 phút!`);
  }
});

//thanh toán và stripe
router.post("/stripe-payment-intent", async (req, res) => {
  try {
    const { amount = 5000 } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "VND",
      payment_method_types: ["card"],
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const generateAppTransId = () => {
    const date = new Date();
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(2);
    const rand = Math.floor(Math.random() * 100000);
    return `${yy}${mm}${dd}_${rand}`;
}

// --- ZALO PAY CONFIG (NÊN để .env) ---
const zaloPayConfig = {
    app_id: 2553,             // AppID test của bạn (nên để .env)
    key1: "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL",    // Key1 test của bạn
    endpoint: "https://sb-openapi.zalopay.vn/v2/create",
};
// Thanh toán ZaloPay
router.post("/zalopay", async (req, res) => {
  try {
    const { amount } = req.body;

    // Kiểm tra amount hợp lệ
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: "Số tiền không hợp lệ." });
    }

    const order = {
      app_id: zaloPayConfig.app_id,
      app_trans_id: generateAppTransId(),
      app_user: "user_test",
      app_time: Date.now(),
      amount: Math.floor(amount), // Sử dụng amount từ req.body
      item: JSON.stringify([]),
      embed_data: JSON.stringify({}), // Không cần orderId
      description: `Thanh toán qua ZaloPay ${amount} VND`,
      bank_code: "",
      callback_url: zaloPayConfig.callback_url,
    };

    // Tạo MAC để bảo mật
    const data =
      order.app_id + "|" +
      order.app_trans_id + "|" +
      order.app_user + "|" +
      order.amount + "|" +
      order.app_time + "|" +
      order.embed_data + "|" +
      order.item;
    order.mac = crypto.createHmac("sha256", zaloPayConfig.key1).update(data).digest("hex");

    console.log('ZaloPay Order:', order);

    // Gửi request tới ZaloPay
    const response = await axios.post(zaloPayConfig.endpoint, order);

    // Trả về cho client: tất cả data ZaloPay trả về, và thêm app_trans_id
    res.json({
      ...response.data,
      app_trans_id: order.app_trans_id
    });

  } catch (e) {
    console.error('ZaloPay Error:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});


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
// kiểm tra thanh toán zalopay
router.post("/zalopay-status", async (req, res) => {
  try {
    const { app_trans_id, orderId } = req.body; // orderId để update DB

    if (!app_trans_id) return res.status(400).json({ error: "Thiếu app_trans_id" });

    // Call ZaloPay
    const payload = {
      app_id: zaloPayConfig.app_id,
      app_trans_id: app_trans_id,
    };
    const data = `${zaloPayConfig.app_id}|${app_trans_id}|${zaloPayConfig.key1}`;
    payload.mac = crypto.createHmac("sha256", zaloPayConfig.key1).update(data).digest("hex");

    const response = await axios.post('https://sb-openapi.zalopay.vn/v2/query', payload);

    // Nếu đơn hàng chưa thanh toán và quá 15 phút thì update DB
    if (orderId) {
      const order = await Order.findById(orderId);
      if (order && order.orderStatus === "pending") {
        const now = new Date();
        const created = new Date(order.createdAt);
        // Kiểm tra đã quá 15 phút chưa
        if (response.data.return_code !== 1 && now - created > 15*60*1000) {
          order.orderStatus = "cancelled";
          await order.save();
        }
      }
    }

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
// GET /order/unpaid-zalopay
// -> Lấy tất cả đơn hàng ZaloPay chưa thanh toán (pending)
router.get("/unpaid-zalopay", async (req, res) => {
  try {
    // Nếu muốn lọc theo thời gian (ví dụ: quá 15 phút), có thể lấy query minutes trên URL
    let { minutes = 0 } = req.query; // minutes = 0 nghĩa là không lọc theo thời gian
    minutes = parseInt(minutes);

    // Lấy các đơn ZaloPay đang pending
    let orders = await Order.find({
      orderStatus: 'pending'
    }).populate('paymentID');

    // Lọc lại đơn có paymentMethod là ZaloPay
    orders = orders.filter(order =>
      order.paymentID &&
      order.paymentID.paymentMethod === "ZaloPay"
    );

    // Nếu truyền minutes, lọc tiếp đơn đã tạo quá X phút
    if (minutes > 0) {
      const now = Date.now();
      orders = orders.filter(order => 
        now - new Date(order.createdAt).getTime() >= minutes * 60 * 1000
      );
    }

    res.json({ orders, total: orders.length });
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
    // 4. Tạo OrderDetail (nếu bạn vẫn muốn giữ collection riêng)
    const detailsPayload = items.map(i => ({
      orderID:    newOrder._id,
      variantID:  i.variantID,
      quantity:   i.quantity,
      price:      i.price
    }));
    const newDetails = await OrderDetail.insertMany(detailsPayload, { session });

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
    const validStatuses = ["pending", "paid", "shipped", "delivered", "cancelled"];
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

