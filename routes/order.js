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
const qs = require("qs");
const moment = require("moment");
require('dotenv').config(); 
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const cron = require('node-cron');
const Wallet = require("../models/Wallet");
// === VNPAY CONFIG ===
const vnp_TmnCode    = process.env.VNP_TMNCODE    || "GH0YA7ZW";
const vnp_HashSecret = process.env.VNP_HASHSECRET || "5YN1GMQMI6WTPMBTT5883CIVTF2K58XR";
const vnp_Url        = process.env.VNP_URL        || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const vnp_ReturnUrl  = process.env.VNP_RETURNURL  || "http://localhost:3000/order/vnpay_return";

function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

// Chạy mỗi 15 phút
cron.schedule('* * * * *', async () => {
  console.log('[CRON] Đang kiểm tra và huỷ các đơn pending quá 1 phút...');
  const now = Date.now();
  const FIFTEEN_MIN = 1 * 60 * 1000;

  let orders = await Order.find({ orderStatus: "pending" }).populate("paymentID");
  const includedMethods = ["ZaloPay", "Stripe", "VNPAY"];
  orders = orders.filter(order =>
    order.paymentID && includedMethods.includes(order.paymentID.paymentMethod)
  );

  const ordersToCancel = orders.filter(order =>
    now - new Date(order.createdAt).getTime() >= FIFTEEN_MIN
  );

  for (const order of ordersToCancel) {
    console.log("[CRON] Chuẩn bị huỷ đơn:", order._id);
    order.orderStatus = "cancelled";
    await order.save();

    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(
          item.variantID,
          { $inc: { stock: item.quantity } }
        );
      } 
    }
    console.log(`[CRON] Đã huỷ đơn hàng #${order._id} do pending quá 1 phút!`);
  }
});



// === STRIPE ===
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

// === ZALOPAY CONFIG ===
const zaloPayConfig = {
    app_id: 2553,
    key1: "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL",
    endpoint: "https://sb-openapi.zalopay.vn/v2/create",
};

// === ZALOPAY: Tạo thanh toán ===
router.post("/zalopay", async (req, res) => {
  try {
    const { amount } = req.body;
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

    const data =
      order.app_id + "|" +
      order.app_trans_id + "|" +
      order.app_user + "|" +
      order.amount + "|" +
      order.app_time + "|" +
      order.embed_data + "|" +
      order.item;
    order.mac = crypto.createHmac("sha256", zaloPayConfig.key1).update(data).digest("hex");

    const response = await axios.post(zaloPayConfig.endpoint, order);
    res.json({ ...response.data, app_trans_id: order.app_trans_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// === VNPAY: Tạo URL thanh toán ===
router.post("/vnpay_create", (req, res) => {
  process.env.TZ = "Asia/Ho_Chi_Minh";

  let date = new Date();
  let createDate = moment(date).format("YYYYMMDDHHmmss");

  let ipAddr =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress;

  let orderId = req.body.orderId;
  let amount = req.body.amount || 10000; // mặc định 10k
  let bankCode = req.body.bankCode;

  let locale = req.body.language || "vn";
  let currCode = "VND";

  let vnp_Params = {};
  vnp_Params["vnp_Version"] = "2.1.0";
  vnp_Params["vnp_Command"] = "pay";
  vnp_Params["vnp_TmnCode"] = vnp_TmnCode;
  vnp_Params["vnp_Locale"] = locale;
  vnp_Params["vnp_CurrCode"] = currCode;
  vnp_Params["vnp_TxnRef"] = orderId;
  vnp_Params["vnp_OrderInfo"] = "Thanh toan don hang: " + orderId;
  vnp_Params["vnp_OrderType"] = "other";
  vnp_Params["vnp_Amount"] = amount * 100;
  vnp_Params["vnp_ReturnUrl"] = vnp_ReturnUrl;
  vnp_Params["vnp_IpAddr"] = ipAddr;
  vnp_Params["vnp_CreateDate"] = createDate;

  if (bankCode) {
    vnp_Params["vnp_BankCode"] = bankCode;
  }

  vnp_Params = sortObject(vnp_Params);

  let signData = qs.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac("sha512", vnp_HashSecret);
  let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  vnp_Params["vnp_SecureHash"] = signed;

  let paymentUrl = vnp_Url + "?" + qs.stringify(vnp_Params, { encode: false });

  res.json({ paymentUrl });
});

// === VNPAY RETURN (Frontend gọi về) ===
// === VNPAY RETURN (Frontend gọi về) ===
router.get("/vnpay_return", async (req, res) => {
  let vnp_Params = req.query;
  let secureHash = vnp_Params["vnp_SecureHash"];

  delete vnp_Params["vnp_SecureHash"];
  delete vnp_Params["vnp_SecureHashType"];

  vnp_Params = sortObject(vnp_Params);

  let signData = qs.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac("sha512", vnp_HashSecret);
  let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  let result;

  if (secureHash === signed && vnp_Params["vnp_ResponseCode"] === "00") {
    // ✅ Thanh toán hợp lệ
    const orderId = vnp_Params["vnp_TxnRef"];
    const amount = vnp_Params["vnp_Amount"] / 100;

    // Cập nhật DB
    try {
      const order = await Order.findById(orderId).populate("paymentID");
      if (order) {
        order.orderStatus = "paid";
        await order.save();

        if (order.paymentID) {
          order.paymentID.status = "paid";
          order.paymentID.isPaid = true;
          await order.paymentID.save();
        }
      }
    } catch (err) {
      console.error("Lỗi update order:", err.message);
    }

    result = {
      status: "success",
      code: vnp_Params["vnp_ResponseCode"],
      message: "Thanh toán thành công",
      orderId,
      amount
    };
  } else {
    result = {
      status: "error",
      code: "97",
      message: "Sai chữ ký hoặc thanh toán thất bại"
    };
  }

  // Render HTML trả về RN WebView
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8" />
      <title>Kết quả thanh toán</title>
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; }
        .card { text-align: center; padding: 20px; border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .success { color: #27ae60; }
        .error { color: #c0392b; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2 class="${result.status}">${result.status === "success" ? "✅ Thanh toán thành công" : "❌ Thanh toán thất bại"}</h2>
        <p>${result.message}</p>
        <p>Mã đơn hàng: ${result.orderId || "-"}</p>
        <p>Số tiền: ${result.amount || 0} VND</p>
      </div>
      <script>
        setTimeout(() => {
          const data = ${JSON.stringify(result)};
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(data));
          }
        }, 500);
      </script>
    </body>
    </html>
  `);
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
// GET /order/unpaid-gateway-orders
// -> Lấy tất cả đơn hàng cổng thanh toán (ZaloPay, Stripe, VNPAY) chưa thanh toán (pending)
router.get("/unpaid-gateway-orders", async (req, res) => {
  try {
    let { minutes = 0 } = req.query; // minutes = 0 nghĩa là không lọc theo thời gian
    minutes = parseInt(minutes);

    // Lấy các đơn đang pending (chưa thanh toán)
    let orders = await Order.find({
      orderStatus: 'pending'
    }).populate('paymentID');

    // Chỉ lấy các đơn có phương thức ZaloPay, Stripe, VNPAY
    const includedMethods = ["ZALOPAY", "STRIPE", "VNPAY"];
    orders = orders.filter(order =>
      order.paymentID &&
      includedMethods.includes(order.paymentID.paymentMethod.toUpperCase())
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
/**
 * POST /order/:id/pay-with-wallet
 * Thanh toán đơn hàng bằng số dư ví
 */
router.post("/:id/pay-with-wallet", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userID } = req.body;
    const order = await Order.findById(req.params.id).populate("paymentID").session(session);

    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
    }

    if (order.orderStatus !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Đơn hàng không ở trạng thái pending." });
    }

    // Tìm ví của user
    const wallet = await Wallet.findOne({ userID }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Không tìm thấy ví của người dùng." });
    }

    if (wallet.balance < order.finalTotal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Số dư không đủ để thanh toán đơn hàng." });
    }

    // Trừ tiền trong ví
    wallet.balance -= order.finalTotal;
    wallet.transactions.push({
      paymentID: order.paymentID?._id || null,
      type: "withdraw",
      amount: order.finalTotal
    });
    await wallet.save({ session });

    // Cập nhật trạng thái payment
    if (order.paymentID) {
      order.paymentID.paymentMethod = "WALLET";
      order.paymentID.status = "paid";
      order.paymentID.isPaid = true;
      await order.paymentID.save({ session });
    }

    // Cập nhật trạng thái order
    order.orderStatus = "paid";
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Thanh toán bằng ví thành công.", balance: wallet.balance, order });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
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


//thanh toán lại
// POST /order/:id/retry-vnpay
router.post("/:id/retry-vnpay", async (req, res) => {
  try {
    const { bankCode } = req.body;

    const order = await Order.findById(req.params.id).populate("paymentID");
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng." });

    if (order.orderStatus !== "pending") {
      return res.status(400).json({ message: "Đơn hàng không còn ở trạng thái pending." });
    }

    if (!order.paymentID || order.paymentID.isPaid) {
      return res.status(400).json({ message: "Đơn hàng đã thanh toán hoặc chưa có payment." });
    }

    // === Tạo lại link thanh toán VNPAY ===
    process.env.TZ = "Asia/Ho_Chi_Minh";
    let date = new Date();
    let createDate = moment(date).format("YYYYMMDDHHmmss");

    let ipAddr =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress;

    let vnp_Params = {};
    vnp_Params["vnp_Version"] = "2.1.0";
    vnp_Params["vnp_Command"] = "pay";
    vnp_Params["vnp_TmnCode"] = vnp_TmnCode;
    vnp_Params["vnp_Locale"] = "vn";
    vnp_Params["vnp_CurrCode"] = "VND";
    vnp_Params["vnp_TxnRef"] = String(order._id);   // dùng _id của order
    vnp_Params["vnp_OrderInfo"] = "Thanh toan don hang: " + order._id;
    vnp_Params["vnp_OrderType"] = "other";
    vnp_Params["vnp_Amount"] = order.finalTotal * 100;
    vnp_Params["vnp_ReturnUrl"] = vnp_ReturnUrl;
    vnp_Params["vnp_IpAddr"] = ipAddr;
    vnp_Params["vnp_CreateDate"] = createDate;

    if (bankCode) {
      vnp_Params["vnp_BankCode"] = bankCode;
    }

    vnp_Params = sortObject(vnp_Params);

    let signData = qs.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", vnp_HashSecret);
    let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
    vnp_Params["vnp_SecureHash"] = signed;

    let paymentUrl = vnp_Url + "?" + qs.stringify(vnp_Params, { encode: false });

    // Cập nhật trạng thái payment về pending (retry)
    order.paymentID.paymentMethod = "VNPAY";
    order.paymentID.status = "pending";
    order.paymentID.isPaid = false;
    await order.paymentID.save();

    res.json({ message: "Khởi tạo lại thanh toán VNPAY thành công.", paymentUrl });
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
      items,         
      voucherCode    
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
    const shippingFee = 30000;
    const finalTotal = Math.max(0, totalAmount - discountAmount) +  shippingFee;

    // === MỚI: Check & giữ chỗ tồn kho (atomic) ngay sau voucher ===
    for (const { variantID, quantity } of items) {
      const updated = await ProductVariant.updateOne(
        { _id: variantID, stock: { $gte: quantity } }, // chỉ match khi đủ tồn
        { $inc: { stock: -quantity } },                // trừ tồn nếu match
        { session }
      );
      if (updated.matchedCount === 0) {
        throw new Error("Một hoặc nhiều sản phẩm không đủ tồn kho. Vui lòng cập nhật giỏ hàng.");
      }
    }
    // === Hết phần thêm mới ===

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
      shippingFee,  
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

    // (ĐÃ BỎ) Giảm stock ở cuối vì đã trừ trong bước check & giữ chỗ tồn kho ở trên
    // for (const { variantID, quantity } of items) {
    //   await ProductVariant.findByIdAndUpdate(
    //     variantID,
    //     { $inc: { stock: -quantity } },
    //     { session }
    //   );
    // }

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
// PUT /order/:id
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findById(req.params.id)
      .populate("userID", "email")
      .populate("paymentID")
      .session(session);

    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Không tìm thấy đơn." });
    }

    const oldStatus = order.orderStatus;
    const { orderStatus, cancellationReason } = req.body;

    // ✅ chỉ nhận các trạng thái hợp lệ
    const validStatuses = ["pending", "paid", "shipped", "delivered", "cancelled"];
    if (orderStatus && !validStatuses.includes(orderStatus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Trạng thái không hợp lệ." });
    }

    // ✅ nếu hủy thì phải có lý do
    if (orderStatus === "cancelled" && (!cancellationReason || !cancellationReason.trim())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Vui lòng cung cấp lý do hủy." });
    }

    if (orderStatus && orderStatus !== oldStatus) {
      order.orderStatus = orderStatus;

      // ====== 🔥 xử lý khi HỦY ======
      if (orderStatus === "cancelled" && oldStatus !== "cancelled") {
        order.cancellationReason = cancellationReason.trim();

        // Hoàn lại stock
        for (const item of order.items) {
          await ProductVariant.findByIdAndUpdate(
            item.variantID,
            { $inc: { stock: item.quantity } },
            { session }
          );
        }

        // 🔥 Nếu đơn đã thanh toán → hoàn tiền vào ví
        if (oldStatus === "paid" || (order.paymentID && order.paymentID.isPaid)) {
          let wallet = await Wallet.findOne({ userID: order.userID._id }).session(session);

          // Nếu chưa có ví thì tạo mới
          if (!wallet) {
            wallet = new Wallet({
              userID: order.userID._id,
              balance: 0,
              transactions: []
            });
          }

          // Cộng tiền lại vào ví
          wallet.balance += order.finalTotal;
          wallet.transactions.push({
            paymentID: order.paymentID?._id || null,
            type: "deposit",
            amount: order.finalTotal,
            date: new Date()
          });

          await wallet.save({ session });

          // Cập nhật payment là refunded
          if (order.paymentID) {
            order.paymentID.status = "refunded";
            order.paymentID.isPaid = false;
            await order.paymentID.save({ session });
          }
        }
      }

      // Lưu order
      await order.save({ session });
     // Ánh xạ trạng thái sang tiếng Việt
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

      // Thiết kế HTML email đẹp mắt
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
              <p>Truy cập <a >Lai app để nt để được giải thích </a> để khám phá thêm sản phẩm.</p>
              <p>Liên hệ hỗ trợ: <a >nguyenhienluong200212@gmail.com</a></p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Gửi email
      await sendEmail({
        to: order.userID.email,
        subject: `Cập nhật trạng thái đơn hàng #${order._id}`,
        text: `Kính gửi ${order.name},\n\nĐơn hàng #${order._id} của bạn đã được cập nhật sang trạng thái: ${vietnameseStatus[orderStatus]}.\n${statusMessages[orderStatus]}\n\nCảm ơn bạn đã mua sắm với chúng tôi!`,
        html: emailHtml
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
// PATCH /order/:id/change-method
// → Dùng để đổi phương thức thanh toán sang COD (tiền mặt)
router.patch("/:id/change-method", async (req, res) => {
  try {
    const { method = "Tiền mặt" } = req.body;

    // Kiểm tra method hợp lệ
    const allowedMethods = ["Tiền mặt"];
    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ message: "Phương thức không hỗ trợ chuyển đổi." });
    }

    const order = await Order.findById(req.params.id).populate("paymentID");
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng." });

    // Chỉ cho phép đổi nếu chưa thanh toán và vẫn đang pending
    if (order.orderStatus !== "pending") {
      return res.status(400).json({ message: "Đơn hàng đã xử lý, không thể đổi phương thức." });
    }

    if (order.paymentID.isPaid) {
      return res.status(400).json({ message: "Đơn hàng đã thanh toán, không thể đổi phương thức." });
    }

    // Cập nhật payment
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
    const allowedMethods = ["ZaloPay", "Stripe"];
    if (!allowedMethods.includes(paymentMethod)) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: "Phương thức thanh toán phải là ZaloPay hoặc Stripe." });
    }

    const order = await Order.findById(req.params.id).populate("paymentID").session(session);
    if (!order) { await session.abortTransaction(); session.endSession(); return res.status(404).json({ message: "Không tìm thấy đơn hàng." }); }
    if (order.orderStatus !== "pending") { await session.abortTransaction(); session.endSession(); return res.status(400).json({ message: "Đơn không ở trạng thái pending." }); }

    const payment = order.paymentID;
    if (!payment) { await session.abortTransaction(); session.endSession(); return res.status(400).json({ message: "Đơn chưa có payment." }); }
    if (payment.isPaid) { await session.abortTransaction(); session.endSession(); return res.status(400).json({ message: "Đơn đã thanh toán, không thể retry." }); }

    const amount = Math.floor(order.finalTotal);
    if (!amount || amount <= 0) { await session.abortTransaction(); session.endSession(); return res.status(400).json({ message: "Số tiền không hợp lệ." }); }

    let paymentResponse = {};

    if (paymentMethod === "ZaloPay") {
      const app_trans_id = generateAppTransId();
      const zpOrder = {
        app_id: zaloPayConfig.app_id,
        app_trans_id,
        app_user: order.userID ? String(order.userID) : "anonymous",
        app_time: Date.now(),
        amount,
        item: JSON.stringify([]), // tránh gửi cấu trúc items nội bộ
        embed_data: JSON.stringify({ orderId: String(order._id) }),
        description: `Retry ZaloPay cho đơn #${order._id} (${amount} VND)`,
        bank_code: "",
        callback_url: zaloPayConfig.callback_url, // đảm bảo đã có trong config
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

      // cập nhật payment
      payment.paymentMethod = "ZaloPay";
      payment.isPaid = false;
      payment.app_trans_id = app_trans_id;   // dùng field này thay vì transactionId
      payment.status = "pending";
      await payment.save({ session });

      paymentResponse = { ...zpRes.data, app_trans_id };
    } else {
      // Stripe: tái sử dụng PI nếu có; nếu PI cũ bị canceled -> tạo mới
      let pi = null;
      if (payment.stripePaymentIntentId) {
        pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
        if (pi.status === "canceled") pi = null;
        else if (["requires_payment_method", "requires_action", "requires_confirmation", "processing"].includes(pi.status)) {
          await session.commitTransaction(); session.endSession();
          return res.json({
            message: `Stripe retry cho đơn #${order._id}`,
            paymentResponse: { clientSecret: pi.client_secret, status: pi.status },
          });
        } else if (pi.status === "succeeded") {
          await session.abortTransaction(); session.endSession();
          return res.status(400).json({ message: "Đơn đã thanh toán Stripe." });
        }
      }

      if (!pi) {
        pi = await stripe.paymentIntents.create({
          amount,
          currency: "vnd", // lowercase
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
    await session.commitTransaction(); session.endSession();

    res.json({
      message: `Đã khởi tạo retry bằng ${paymentMethod} cho đơn #${order._id}.`,
      paymentResponse
    });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    res.status(500).json({ message: err.message });
  }
});
// GET /order/:id/status
// → Chỉ trả về trạng thái order + payment
router.get("/:id/status", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("paymentID");
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn." });

    res.json({
      orderId: order._id,
      orderStatus: order.orderStatus,
      payment: order.paymentID
        ? {
            paymentId: order.paymentID._id,
            method: order.paymentID.paymentMethod,
            status: order.paymentID.status,
            isPaid: order.paymentID.isPaid,
            amount: order.paymentID.amount
          }
        : null
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
