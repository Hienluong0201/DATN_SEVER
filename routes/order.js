const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const sendEmail = require("../utils/sendEmail");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const ProductVariant = require("../models/ProductVariant");
const Voucher = require("../models/Voucher");
const OrderDetail = require("../models/OrderDetail");
const crypto = require("crypto");
const axios = require("axios");
require('dotenv').config(); 
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const cron = require('node-cron');

// VNPay Config
const vnpayConfig = {
  vnp_TmnCode: process.env.VNPAY_TMN_CODE || "EIA89ZRK",
  vnp_HashSecret: process.env.VNPAY_HASH_SECRET || "DSD38L6K7QX5D2LCLXO7UY62NWGU34HL",
  vnp_Url: process.env.VNPAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  vnp_ReturnUrl: process.env.VNPAY_RETURN_URL || "https://datn-sever.onrender.com/vnpay-return",
  vnp_ApiUrl: process.env.VNPAY_API_URL || "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
};

// Hàm tạo mã giao dịch VNPay
const generateVnpTxnRef = () => {
  const date = new Date();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  const rand = Math.floor(Math.random() * 100000);
  return `${yy}${mm}${dd}${rand}`;
};
// Chạy mỗi 15 phút
cron.schedule('*/15 * * * *', async () => {
  console.log('[CRON] Đang kiểm tra và huỷ các đơn pending quá 15 phút...');

  const now = Date.now();
  const FIFTEEN_MIN = 15 * 60 * 1000;

  // 1. Lấy tất cả đơn pending
  let orders = await Order.find({ orderStatus: "pending" }).populate("paymentID");

  // 2. Lọc lại đơn có paymentMethod là ZaloPay, Stripe hoặc VNPay
  const includedMethods = ["ZaloPay", "Stripe", "VNPay"];
  orders = orders.filter(order =>
    order.paymentID && includedMethods.includes(order.paymentID.paymentMethod)
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

// Thanh toán VNPay
// Thanh toán VNPay
router.post("/vnpay", async (req, res) => {
  try {
    const { amount, orderId } = req.body;

    // Kiểm tra amount hợp lệ
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: "Số tiền không hợp lệ." });
    }

    // Tạo tham số thanh toán VNPay
    const vnpParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: vnpayConfig.vnp_TmnCode,
      vnp_Amount: Math.floor(amount) * 100, // VNPay yêu cầu nhân 100
      vnp_CurrCode: 'VND',
      vnp_TxnRef: generateVnpTxnRef(),
      vnp_OrderInfo: `Thanh toán đơn hàng #${orderId || vnpParams.vnp_TxnRef} (${amount} VND)`,
      vnp_OrderType: '250000',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: vnpayConfig.vnp_ReturnUrl,
      vnp_IpAddr: req.ip || '127.0.0.1',
      vnp_CreateDate: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
    };

    // Sắp xếp tham số theo thứ tự alphabet
    const sortedParams = {};
    Object.keys(vnpParams).sort().forEach(key => {
      if (vnpParams[key] !== null && vnpParams[key] !== undefined) {
        sortedParams[key] = encodeURIComponent(vnpParams[key]).replace(/%20/g, '+');
      }
    });

    // Tạo chuỗi ký tự để tạo checksum
    const signData = new URLSearchParams(sortedParams).toString();
    console.log('SignData for /vnpay:', signData); // Debug chuỗi ký tự
    const hmac = crypto.createHmac("sha512", vnpayConfig.vnp_HashSecret);
    sortedParams.vnp_SecureHash = hmac.update(signData).digest("hex");

    // Tạo URL thanh toán
    const vnpUrl = `${vnpayConfig.vnp_Url}?${new URLSearchParams(sortedParams).toString()}`;

    // Cập nhật Payment nếu có orderId
    if (orderId) {
      const payment = await Payment.findOne({ orderID: orderId });
      if (payment) {
        payment.paymentMethod = "VNPay";
        payment.transactionId = vnpParams.vnp_TxnRef;
        payment.status = "pending";
        await payment.save();
      }
    }

    res.json({
      paymentUrl: vnpUrl,
      vnp_TxnRef: vnpParams.vnp_TxnRef,
    });
  } catch (e) {
    console.error('VNPay Error:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// Kiểm tra trạng thái thanh toán VNPay
router.post("/vnpay-status", async (req, res) => {
  try {
    const { vnp_TxnRef, orderId } = req.body;

    if (!vnp_TxnRef) return res.status(400).json({ error: "Thiếu vnp_TxnRef" });

    // Tạo tham số kiểm tra trạng thái
    const vnpParams = {
      vnp_TmnCode: vnpayConfig.vnp_TmnCode,
      vnp_TxnRef: vnp_TxnRef,
      vnp_OrderInfo: `Kiểm tra trạng thái giao dịch #${vnp_TxnRef}`,
      vnp_TransDate: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
      vnp_IpAddr: req.ip || '127.0.0.1',
      vnp_RequestId: generateVnpTxnRef(),
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
    };

    // Tạo chữ ký
    const signData = Object.keys(vnpParams)
      .sort()
      .reduce((str, key) => str + key + '=' + vnpParams[key] + '&', '')
      .slice(0, -1);
    vnpParams.vnp_SecureHash = crypto.createHmac("sha512", vnpayConfig.vnp_HashSecret)
      .update(signData)
      .digest("hex");

    // Gửi yêu cầu kiểm tra trạng thái
    const response = await axios.post(vnpayConfig.vnp_ApiUrl, vnpParams);

    // Cập nhật trạng thái đơn hàng nếu cần
    if (orderId && response.data.vnp_ResponseCode === "00") {
      const order = await Order.findById(orderId).populate("paymentID");
      if (order && order.paymentID && order.orderStatus === "pending") {
        if (response.data.vnp_TransactionStatus === "00") { // Giao dịch thành công
          order.orderStatus = "paid";
          order.paymentID.isPaid = true;
          order.paymentID.status = "completed";
          await order.paymentID.save();
          await order.save();
        } else if (Date.now() - new Date(order.createdAt).getTime() > 15 * 60 * 1000) {
          order.orderStatus = "cancelled";
          await order.save();
          for (const item of order.items) {
            await ProductVariant.findByIdAndUpdate(item.variantID, { $inc: { stock: item.quantity } });
          }
        }
      }
    }

    res.json(response.data);
  } catch (e) {
    console.error('VNPay Status Error:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// Xử lý callback từ VNPay
// Xử lý callback từ VNPay
router.get("/vnpay-return", async (req, res) => {
  try {
    const vnpParams = { ...req.query };
    const secureHash = vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    // Sắp xếp tham số theo thứ tự alphabet
    const sortedParams = {};
    Object.keys(vnpParams).sort().forEach(key => {
      if (vnpParams[key] !== null && vnpParams[key] !== undefined) {
        sortedParams[key] = decodeURIComponent(vnpParams[key]);
      }
    });

    // Tạo chuỗi ký tự để kiểm tra chữ ký
    const signData = new URLSearchParams(sortedParams).toString();
    console.log('SignData for /vnpay-return:', signData); // Debug chuỗi ký tự
    const hmac = crypto.createHmac("sha512", vnpayConfig.vnp_HashSecret);
    const calculatedHash = hmac.update(signData).digest("hex");

    if (secureHash !== calculatedHash) {
      console.error('Invalid signature. Expected:', secureHash, 'Calculated:', calculatedHash);
      return res.status(400).json({ error: "Invalid signature" });
    }

    const orderId = vnpParams.vnp_OrderInfo.split('#')[1].split(' ')[0];
    const vnp_TxnRef = vnpParams.vnp_TxnRef;
    const responseCode = vnpParams.vnp_ResponseCode;

    const order = await Order.findById(orderId).populate("paymentID");
    if (!order || !order.paymentID) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng hoặc payment." });
    }

    if (responseCode === "00" && order.orderStatus === "pending") {
      order.orderStatus = "paid";
      order.paymentID.isPaid = true;
      order.paymentID.status = "completed";
      order.paymentID.transactionId = vnp_TxnRef;
      await order.paymentID.save();
      await order.save();
    } else if (responseCode !== "00" && Date.now() - new Date(order.createdAt).getTime() > 15 * 60 * 1000) {
      order.orderStatus = "cancelled";
      order.cancellationReason = "Giao dịch VNPay thất bại hoặc quá thời gian.";
      await order.save();
      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(item.variantID, { $inc: { stock: item.quantity } });
      }
    }

    // Chuyển hướng người dùng về trang kết quả trên server Render
    res.redirect(`https://datn-sever.onrender.com/order/${orderId}`);
  } catch (e) {
    console.error('VNPay Return Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
// Thanh toán Stripe
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
};

// ZaloPay Config
const zaloPayConfig = {
  app_id: process.env.ZALOPAY_APP_ID || 2553,
  key1: process.env.ZALOPAY_KEY1 || "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL",
  endpoint: "https://sb-openapi.zalopay.vn/v2/create",
  callback_url: process.env.ZALOPAY_CALLBACK_URL || "http://localhost:3000/zalopay-callback",
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
      amount: Math.floor(amount),
      item: JSON.stringify([]),
      embed_data: JSON.stringify({}),
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

    // Trả về cho client
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
router.get("/", async (req, res) => {
  try {
    let { limit = 10, page = 1, search = "" } = req.query;
    limit = Math.max(parseInt(limit) || 10, 1);
    page = Math.max(parseInt(page) || 1, 1);

    const filter = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        ...(search.length === 24 ? [{ _id: search }] : []),
        { name: regex },
        { sdt: regex },
      ];
    }

    const total = await Order.countDocuments(filter);

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

// Kiểm tra thanh toán ZaloPay
router.post("/zalopay-status", async (req, res) => {
  try {
    const { app_trans_id, orderId } = req.body;

    if (!app_trans_id) return res.status(400).json({ error: "Thiếu app_trans_id" });

    const payload = {
      app_id: zaloPayConfig.app_id,
      app_trans_id: app_trans_id,
    };
    const data = `${zaloPayConfig.app_id}|${app_trans_id}|${zaloPayConfig.key1}`;
    payload.mac = crypto.createHmac("sha256", zaloPayConfig.key1).update(data).digest("hex");

    const response = await axios.post('https://sb-openapi.zalopay.vn/v2/query', payload);

    if (orderId) {
      const order = await Order.findById(orderId);
      if (order && order.orderStatus === "pending") {
        const now = new Date();
        const created = new Date(order.createdAt);
        if (response.data.return_code !== 1 && now - created > 15 * 60 * 1000) {
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

// GET /order/unpaid-gateway-orders
router.get("/unpaid-gateway-orders", async (req, res) => {
  try {
    let { minutes = 0 } = req.query;
    minutes = parseInt(minutes);

    let orders = await Order.find({ orderStatus: 'pending' }).populate('paymentID');

    const includedMethods = ["ZaloPay", "Stripe", "VNPay"];
    orders = orders.filter(order =>
      order.paymentID && includedMethods.includes(order.paymentID.paymentMethod)
    );

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

// POST /order/checkout
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
      items,
      voucherCode
    } = req.body;

    if (!userID || !paymentInfo || !shippingAddress || !name || !sdt || !items?.length) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc hoặc items rỗng." });
    }

    // Kiểm tra phương thức thanh toán hợp lệ
    const allowedMethods = ["ZaloPay", "Stripe", "VNPay", "Tiền mặt"];
    if (!allowedMethods.includes(paymentInfo.paymentMethod)) {
      throw new Error("Phương thức thanh toán không hỗ trợ.");
    }

    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let discountAmount = 0;
    let voucherId = null;

    if (voucherCode) {
      const voucher = await Voucher.findOne({ code: voucherCode.trim().toUpperCase(), isActive: true });
      if (!voucher) throw new Error('Voucher không hợp lệ hoặc đã hết hạn');

      const now = new Date();
      if (now < voucher.validFrom || now > voucher.validTo) throw new Error('Voucher chưa đến ngày sử dụng hoặc đã hết hạn');
      if (voucher.usedCount >= voucher.usageLimit) throw new Error('Voucher đã đạt giới hạn sử dụng');
      if (totalAmount < voucher.minOrderValue) throw new Error(`Đơn tối thiểu phải từ ${voucher.minOrderValue}`);

      discountAmount = voucher.discountType === 'percent'
        ? totalAmount * (voucher.discountValue / 100)
        : voucher.discountValue;
      voucherId = voucher._id;

      voucher.usedCount += 1;
      if (voucher.usedCount >= voucher.usageLimit) voucher.isActive = false;
      await voucher.save({ session });
    }

    const finalTotal = Math.max(0, totalAmount - discountAmount) + 30000;

    for (const { variantID, quantity } of items) {
      const updated = await ProductVariant.updateOne(
        { _id: variantID, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { session }
      );
      if (updated.matchedCount === 0) {
        throw new Error("Một hoặc nhiều sản phẩm không đủ tồn kho. Vui lòng cập nhật giỏ hàng.");
      }
    }

    const [newPayment] = await Payment.create([{
      ...paymentInfo,
      amount: finalTotal,
      createdAt: new Date(),
      userID
    }], { session });

    const [newOrder] = await Order.create([{
      userID,
      paymentID: newPayment._id,
      shippingAddress,
      orderStatus,
      name,
      sdt,
      items,
      totalAmount,
      discountAmount,
      finalTotal,
      voucher: voucherId,
      orderDate: new Date()
    }], { session });

    const detailsPayload = items.map(i => ({
      orderID: newOrder._id,
      variantID: i.variantID,
      quantity: i.quantity,
      price: i.price
    }));
    await OrderDetail.insertMany(detailsPayload, { session });

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
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findById(req.params.id)
      .populate("userID", "email")
      .session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Không tìm thấy đơn." });
    }

    const oldStatus = order.orderStatus;
    const { orderStatus, cancellationReason } = req.body;

    const validStatuses = ["pending", "paid", "shipped", "delivered", "cancelled"];
    if (orderStatus && !validStatuses.includes(orderStatus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Trạng thái không hợp lệ." });
    }

    if (orderStatus === "cancelled" && (!cancellationReason || typeof cancellationReason !== "string" || cancellationReason.trim() === "")) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Vui lòng cung cấp lý do hủy." });
    }

    if (orderStatus && orderStatus !== oldStatus) {
      order.orderStatus = orderStatus;

      if (orderStatus === "cancelled" && oldStatus !== "cancelled") {
        order.cancellationReason = cancellationReason.trim();
        for (const item of order.items) {
          await ProductVariant.findByIdAndUpdate(
            item.variantID,
            { $inc: { stock: item.quantity } },
            { session }
          );
        }
      }

      await order.save({ session });

      const statusMessages = {
        pending: "Đơn hàng của bạn đang chờ xử lý. Chúng tôi sẽ sớm liên hệ để xác nhận.",
        paid: "Đơn hàng của bạn đã được thanh toán. Chúng tôi đang chuẩn bị hàng.",
        shipped: "Đơn hàng của bạn đã được giao cho đơn vị vận chuyển. Vui lòng theo dõi trạng thái giao hàng.",
        delivered: "Đơn hàng của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm!",
        cancelled: `Đơn hàng của bạn đã bị hủy. <strong>Lý do: ${order.cancellationReason}</strong>`
      };

      const vietnameseStatus = {
        pending: "Đang chờ xử lý",
        paid: "Đã thanh toán",
        shipped: "Đã giao hàng",
        delivered: "Hoàn thành",
        cancelled: "Đã hủy"
      };

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .header { background: #007bff; padding: 20px; text-align: center; border-top-left-radius: 8px; border-top-right-radius: 8px; }
            .header img { max-width: 150px; height: auto; }
            .content { padding: 20px; }
            .content h2 { color: #333; }
            .status { font-size: 18px; font-weight: bold; color: ${orderStatus === "cancelled" ? "#dc3545" : "#28a745"}; }
            .reason { background: #f8d7da; padding: 10px; border-radius: 4px; color: #721c24; margin-top: 10px; }
            .footer { text-align: center; padding: 20px; font-size: 14px; color: #666; border-top: 1px solid #eee; }
            .footer a { color: #007bff; text-decoration: none; }
            .button { display: inline-block; padding: 10px 20px; margin-top: 20px; background: #007bff; color: #fff; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://your-logo-url.com/logo.png" alt="Company Logo" />
            </div>
            <div class="content">
              <h2>Kính gửi ${order.name},</h2>
              <p>Cảm ơn bạn đã mua sắm tại cửa hàng của chúng tôi!</p>
              <p>Đơn hàng <strong>#${order._id}</strong> của bạn đã được cập nhật sang trạng thái: <span class="status">${vietnameseStatus[orderStatus]}</span>.</p>
              <p>${statusMessages[orderStatus]}</p>
              ${orderStatus === "cancelled" ? `<div class="reason">Lý do hủy: ${order.cancellationReason}</div>` : ""}
              <p>Để xem chi tiết đơn hàng, vui lòng <a href="https://your-website.com/order/${order._id}" class="button">Xem đơn hàng</a>.</p>
            </div>
            <div class="footer">
              <p>Cảm ơn bạn đã tin tưởng chúng tôi!</p>
              <p>Truy cập <a>Lai app để nt để được giải thích</a> để khám phá thêm sản phẩm.</p>
              <p>Liên hệ hỗ trợ: <a>nguyenhienluong200212@gmail.com</a></p>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail({
        to: order.userID.email,
        subject: `Cập nhật trạng thái đơn hàng #${order._id}`,
        text: `Kính gửi ${order.name},\n\nĐơn hàng #${order._id} của bạn đã được cập nhật sang trạng thái: ${vietnameseStatus[orderStatus]}.\n${statusMessages[orderStatus]}\n\nCảm ơn bạn đã mua sắm với chúng tôi!`,
        html: emailHtml
      });
    } else {
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

// PATCH /order/:id/change-method
router.patch("/:id/change-method", async (req, res) => {
  try {
    const { method = "Tiền mặt" } = req.body;

    const allowedMethods = ["Tiền mặt"];
    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ message: "Phương thức không hỗ trợ chuyển đổi." });
    }

    const order = await Order.findById(req.params.id).populate("paymentID");
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng." });

    if (order.orderStatus !== "pending") {
      return res.status(400).json({ message: "Đơn hàng đã xử lý, không thể đổi phương thức." });
    }

    if (order.paymentID.isPaid) {
      return res.status(400).json({ message: "Đơn hàng đã thanh toán, không thể đổi phương thức." });
    }

    order.paymentID.paymentMethod = method;
    order.paymentID.isPaid = false;
    await order.paymentID.save();

    res.json({ message: "Đã cập nhật sang thanh toán tiền mặt (COD).", order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /order/:id/retry-payment
router.post("/:id/retry-payment", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { paymentMethod } = req.body;
    const allowedMethods = ["ZaloPay", "Stripe", "VNPay"];
    if (!allowedMethods.includes(paymentMethod)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Phương thức thanh toán phải là ZaloPay, Stripe hoặc VNPay." });
    }

    const order = await Order.findById(req.params.id).populate("paymentID").session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
    }
    if (order.orderStatus !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Đơn không ở trạng thái pending." });
    }

    const payment = order.paymentID;
    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Đơn chưa có payment." });
    }
    if (payment.isPaid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Đơn đã thanh toán, không thể retry." });
    }

    const amount = Math.floor(order.finalTotal);
    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Số tiền không hợp lệ." });
    }

    let paymentResponse = {};

    if (paymentMethod === "ZaloPay") {
      const app_trans_id = generateAppTransId();
      const zpOrder = {
        app_id: zaloPayConfig.app_id,
        app_trans_id,
        app_user: order.userID ? String(order.userID) : "anonymous",
        app_time: Date.now(),
        amount,
        item: JSON.stringify([]),
        embed_data: JSON.stringify({ orderId: String(order._id) }),
        description: `Retry ZaloPay cho đơn #${order._id} (${amount} VND)`,
        bank_code: "",
        callback_url: zaloPayConfig.callback_url,
      };
      const macData = [
        zpOrder.app_id,
        zpOrder.app_trans_id,
        zpOrder.app_user,
        zpOrder.amount,
        zpOrder.app_time,
        zpOrder.embed_data,
        zpOrder.item
      ].join("|");
      zpOrder.mac = crypto.createHmac("sha256", zaloPayConfig.key1).update(macData).digest("hex");

      const zpRes = await axios.post(zaloPayConfig.endpoint, zpOrder);

      payment.paymentMethod = "ZaloPay";
      payment.isPaid = false;
      payment.app_trans_id = app_trans_id;
      payment.status = "pending";
      await payment.save({ session });

      paymentResponse = { ...zpRes.data, app_trans_id };
    } else if (paymentMethod === "VNPay") {
      const vnp_TxnRef = generateVnpTxnRef();
      const vnpParams = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: vnpayConfig.vnp_TmnCode,
        vnp_Amount: amount * 100,
        vnp_CurrCode: 'VND',
        vnp_TxnRef: vnp_TxnRef,
        vnp_OrderInfo: `Retry VNPay cho đơn #${order._id} (${amount} VND)`,
        vnp_OrderType: '250000',
        vnp_Locale: 'vn',
        vnp_ReturnUrl: vnpayConfig.vnp_ReturnUrl,
        vnp_IpAddr: req.ip || '127.0.0.1',
        vnp_CreateDate: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
      };

      const sortedParams = Object.keys(vnpParams)
        .sort()
        .reduce((obj, key) => {
          obj[key] = vnpParams[key];
          return obj;
        }, {});

      const signData = new URLSearchParams(sortedParams).toString();
      const hmac = crypto.createHmac("sha512", vnpayConfig.vnp_HashSecret);
      const vnp_SecureHash = hmac.update(signData).digest("hex");
      sortedParams.vnp_SecureHash = vnp_SecureHash;

      const vnpUrl = `${vnpayConfig.vnp_Url}?${new URLSearchParams(sortedParams).toString()}`;

      payment.paymentMethod = "VNPay";
      payment.isPaid = false;
      payment.transactionId = vnp_TxnRef;
      payment.status = "pending";
      await payment.save({ session });

      paymentResponse = { paymentUrl: vnpUrl, vnp_TxnRef };
    } else {
      let pi = null;
      if (payment.stripePaymentIntentId) {
        pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
        if (pi.status === "canceled") pi = null;
        else if (["requires_payment_method", "requires_action", "requires_confirmation", "processing"].includes(pi.status)) {
          await session.commitTransaction();
          session.endSession();
          return res.json({
            message: `Stripe retry cho đơn #${order._id}`,
            paymentResponse: { clientSecret: pi.client_secret, status: pi.status },
          });
        } else if (pi.status === "succeeded") {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: "Đơn đã thanh toán Stripe." });
        }
      }

      if (!pi) {
        pi = await stripe.paymentIntents.create({
          amount,
          currency: "vnd",
          automatic_payment_methods: { enabled: true },
          metadata: { orderId: String(order._id), paymentId: String(payment._id) },
        });
        payment.paymentMethod = "Stripe";
        payment.isPaid = false;
        payment.stripePaymentIntentId = pi.id;
        payment.stripeClientSecret = pi.client_secret;
        payment.status = "pending";
        await payment.save({ session });
      }
      paymentResponse = { clientSecret: pi.client_secret, status: pi.status };
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({
      message: `Đã khởi tạo retry bằng ${paymentMethod} cho đơn #${order._id}.`,
      paymentResponse
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;