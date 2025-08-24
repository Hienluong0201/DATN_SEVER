const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Wallet = require('../models/Wallet');
const Order = require('../models/Order');
const Payment = require('../models/Payment');


// POST /wallet/create
router.post("/create", async (req, res) => {
  try {
    const { userID } = req.body;
    if (!userID) return res.status(400).json({ message: "Thiếu userID." });

    // Check xem đã có ví chưa
    let wallet = await Wallet.findOne({ userID });
    if (wallet) {
      return res.status(400).json({ message: "User này đã có ví." });
    }

    wallet = new Wallet({
      userID,
      balance: 0,
      transactions: []
    });

    await wallet.save();
    res.status(201).json({ message: "Tạo ví thành công.", wallet });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// =============================
// GET /api/v1/wallet/:userID  (lấy thông tin ví của user)
// =============================

router.get('/:userID', async (req, res) => {
  try {
    const { userID } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userID)) {
      return res.status(400).json({ message: 'UserID không hợp lệ.' });
    }

    const wallet = await Wallet.findOne({ userID })
      .populate('transactions.paymentID');

    if (!wallet) {
      return res.status(404).json({ message: 'Không tìm thấy ví.' });
    }

    res.json(wallet);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =============================
// POST /api/v1/wallet/deposit  (nạp tiền vào ví)
// =============================
router.post('/deposit', async (req, res) => {
  try {
    const { userID, amount, paymentID } = req.body;

    if (!userID || !amount) {
      return res.status(400).json({ message: 'Thiếu userID hoặc amount.' });
    }

    let wallet = await Wallet.findOne({ userID });
    if (!wallet) return res.status(404).json({ message: 'Không tìm thấy ví.' });

    // cộng tiền
    wallet.balance += Number(amount);

    // thêm transaction
    wallet.transactions.push({
      paymentID: paymentID || null,
      type: 'deposit',
      amount
    });

    await wallet.save();

    res.json({ message: 'Nạp tiền thành công.', balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =============================
// POST /api/v1/wallet/pay  (thanh toán bằng ví)
// =============================
router.post('/pay', async (req, res) => {
  try {
    const { userID, orderID, amount } = req.body;

    if (!userID || !orderID || !amount) {
      return res.status(400).json({ message: 'Thiếu userID, orderID hoặc amount.' });
    }

    let wallet = await Wallet.findOne({ userID });
    if (!wallet) return res.status(404).json({ message: 'Không tìm thấy ví.' });

    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Số dư không đủ.' });
    }

    // trừ tiền
    wallet.balance -= Number(amount);

    wallet.transactions.push({
      type: 'withdraw',
      amount
    });

    await wallet.save();

    // cập nhật trạng thái đơn hàng
    await Order.findByIdAndUpdate(orderID, { orderStatus: 'paid' });

    res.json({ message: 'Thanh toán thành công.', balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =============================
// POST /api/v1/wallet/refund  (hoàn tiền khi hủy đơn)
// =============================
router.post('/refund', async (req, res) => {
  try {
    const { userID, orderID, amount } = req.body;

    if (!userID || !orderID || !amount) {
      return res.status(400).json({ message: 'Thiếu userID, orderID hoặc amount.' });
    }

    let wallet = await Wallet.findOne({ userID });
    if (!wallet) return res.status(404).json({ message: 'Không tìm thấy ví.' });

    // cộng tiền lại
    wallet.balance += Number(amount);

    wallet.transactions.push({
      type: 'deposit',
      amount
    });

    await wallet.save();

    // cập nhật đơn hàng về cancelled
    await Order.findByIdAndUpdate(orderID, { orderStatus: 'cancelled' });

    res.json({ message: 'Hoàn tiền thành công.', balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =============================
// DELETE /api/v1/wallet/:userID (xóa ví - chỉ admin dùng)
// =============================
router.delete('/:userID', async (req, res) => {
  try {
    const { userID } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userID)) {
      return res.status(400).json({ message: 'UserID không hợp lệ.' });
    }

    const wallet = await Wallet.findOneAndDelete({ userID });
    if (!wallet) {
      return res.status(404).json({ message: 'Không tìm thấy ví.' });
    }

    res.json({ message: 'Xóa ví thành công.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
