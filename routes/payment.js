const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');

// 1. Tạo mới một Payment
// POST /payments
router.post('/', async (req, res) => {
  try {
    const { paymentMethod, paymentGateway, status } = req.body;
    if (!paymentMethod) {
      return res.status(400).json({ message: 'paymentMethod là bắt buộc.' });
    }
    const payment = new Payment({
      paymentMethod,
      paymentGateway,
      status
    });
    const saved = await payment.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. Lấy danh sách tất cả Payments
// GET /payments
router.get('/', async (req, res) => {
  try {
    const payments = await Payment.find().sort('-createdAt');
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. Lấy chi tiết một Payment theo id
// GET /payments/:id
router.get('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Không tìm thấy payment.' });
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. Cập nhật một Payment
// PUT /payments/:id
router.put('/:id', async (req, res) => {
  try {
    const { paymentMethod, paymentGateway, status } = req.body;
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Không tìm thấy payment.' });
    }
    if (paymentMethod !== undefined) payment.paymentMethod = paymentMethod;
    if (paymentGateway !== undefined) payment.paymentGateway = paymentGateway;
    if (status !== undefined) payment.status = status;
    const updated = await payment.save();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. Xóa một Payment
// DELETE /payments/:id
router.delete('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Không tìm thấy payment.' });
    }
    await payment.remove();
    res.json({ message: 'Xóa payment thành công.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// GET /payments/:id/status
router.get('/:id/status', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Không tìm thấy payment.' });
    }

    res.json({ status: payment.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;
