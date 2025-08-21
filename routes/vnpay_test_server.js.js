const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ==== CONFIG ====
const vnpayConfig = {
  tmnCode: process.env.VNP_TMNCODE || "GH0YA7ZW",
  hashSecret: process.env.VNP_HASHSECRET || "E9R2LDD2C4KFGPQLY05MPCZAHIZP8QS8",
  vnpUrl: process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: process.env.VNP_RETURNURL || "http://localhost:3000/vnpay-return",
  ipnUrl: process.env.VNP_IPNURL || "http://localhost:3000/vnpay-ipn",
};

// ==== Helpers ====
const pad2 = (n) => String(n).padStart(2, "0");
const formatDateTime = (d = new Date()) =>
  d.getFullYear().toString() +
  pad2(d.getMonth() + 1) +
  pad2(d.getDate()) +
  pad2(d.getHours()) +
  pad2(d.getMinutes()) +
  pad2(d.getSeconds());

const sortKeys = (obj) => Object.keys(obj).sort();
const buildSignData = (params) =>
  sortKeys(params).map((k) => `${k}=${params[k]}`).join("&"); // KHÔNG encode
const buildQueryEncoded = (params) =>
  sortKeys(params).map((k) => `${k}=${encodeURIComponent(params[k])}`).join("&");
const hmac512 = (data, secret) => crypto.createHmac("sha512", secret).update(data).digest("hex");

// ==== Endpoint: tạo URL thanh toán ====
app.get("/vnpay-create", (req, res) => {
  const amount = 100000; // 100k VND
  const txnRef = Date.now().toString();
  const createDate = formatDateTime();
  const expireDate = formatDateTime(new Date(Date.now() + 15 * 60 * 1000));

  let vnp_Params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnpayConfig.tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Test thanh toan #${txnRef}`,
    vnp_OrderType: "other",
    vnp_Amount: amount * 100, // IMPORTANT: *100
    vnp_ReturnUrl: vnpayConfig.returnUrl,
    vnp_IpAddr: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "127.0.0.1",
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  const signData = buildSignData(vnp_Params);
  const secureHash = hmac512(signData, vnpayConfig.hashSecret);
  const paymentUrl = `${vnpayConfig.vnpUrl}?${buildQueryEncoded(vnp_Params)}&vnp_SecureHash=${secureHash}`;

  res.json({ paymentUrl, signData, secureHash, note: "Mở paymentUrl để test sandbox." });
});

// ==== Endpoint: Return (user quay về) ====
app.get("/vnpay-return", (req, res) => {
  const params = { ...req.query };
  const secureHash = params.vnp_SecureHash;
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const signData = buildSignData(params);
  const checkHash = hmac512(signData, vnpayConfig.hashSecret);

  res.json({
    from: "return",
    validChecksum: (secureHash || "").toLowerCase() === checkHash.toLowerCase(),
    vnp_ResponseCode: params.vnp_ResponseCode,
    vnp_TransactionStatus: params.vnp_TransactionStatus,
    signData,
    myHash: checkHash,
    providedHash: secureHash,
  });
});

// ==== Endpoint: IPN (server->server) ====
app.get("/vnpay-ipn", (req, res) => {
  const params = { ...req.query };
  const secureHash = params.vnp_SecureHash;
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const signData = buildSignData(params);
  const checkHash = hmac512(signData, vnpayConfig.hashSecret);

  if ((secureHash || "").toLowerCase() !== checkHash.toLowerCase()) {
    return res.status(200).json({ RspCode: "97", Message: "Invalid Checksum" });
  }

  // Thành công khi '00'
  const code = params.vnp_ResponseCode;
  if (code === "00") {
    return res.status(200).json({ RspCode: "00", Message: "Success" });
  } else {
    return res.status(200).json({ RspCode: "00", Message: "Payment Failed" });
  }
});

// ==== Run server ====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VNPAY test server: http://localhost:${PORT}`);
  console.log(`Tạo link test:    http://localhost:${PORT}/vnpay-create`);
});
