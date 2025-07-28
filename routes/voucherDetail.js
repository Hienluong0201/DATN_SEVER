const express = require('express');
const router = express.Router();
const VoucherDetail = require('../models/voucherDetail');
const Voucher = require('../models/Voucher');


// Nhận voucher (Claim)
router.post('/claim/:voucherId', async (req, res) => {
  const { userId } = req.body;
  const { voucherId } = req.params;

  try {
    const existing = await VoucherDetail.findOne({ user: userId, voucher: voucherId });
    if (existing) return res.status(400).json({ message: 'Bạn đã nhận voucher này rồi' });

    const voucher = await Voucher.findById(voucherId);
    if (!voucher || !voucher.isActive) return res.status(404).json({ message: 'Voucher không tồn tại hoặc đã hết hạn' });

    await VoucherDetail.create({
      user: userId,
      voucher: voucherId
    });

    res.json({ message: 'Nhận voucher thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi nhận voucher', error: err.message });
  }
});


// Lấy danh sách voucher đã nhận
router.get('/my-vouchers/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const vouchers = await VoucherDetail.find({ user: userId })
      .populate('voucher')
      .sort({ createdAt: -1 });

    res.json(vouchers);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách voucher', error: err.message });
  }
});

// Đánh dấu đã dùng (gọi khi checkout)
router.post('/use/:voucherDetailId', async (req, res) => {
  const { userId } = req.body;
  const { voucherDetailId } = req.params;

  try {
    const vd = await VoucherDetail.findOne({ _id: voucherDetailId, user: userId }).populate('voucher');
    if (!vd || vd.isUsed) return res.status(400).json({ message: 'Voucher không hợp lệ hoặc đã sử dụng' });

    const now = new Date();
    if (now < vd.voucher.validFrom || now > vd.voucher.validTo) {
      return res.status(400).json({ message: 'Voucher đã hết hạn' });
    }

    vd.isUsed = true;
    vd.usedAt = now;
    await vd.save();

    vd.voucher.usedCount += 1;
    await vd.voucher.save();

    res.json({ message: 'Đã sử dụng voucher thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi sử dụng voucher', error: err.message });
  }
});

// MINI GAME: Quay số random nhận voucher
// POST /voucherDetail/spin
router.post('/spin', async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: 'Thiếu userId!' });

  // Xác suất trúng (vd: 30%)
  const win = Math.random() < 0.3;

  if (!win) {
    return res.json({ win: false, message: 'Bạn chưa trúng, thử lại nhé!' });
  }

  // Lấy voucher tổng còn hạn, còn lượt
  const now = new Date();
  const vouchers = await Voucher.find({
    isActive: true,
    validFrom: { $lte: now },
    validTo: { $gte: now },
    usageLimit: { $gt: 0 }
  });

  if (!vouchers.length) {
    return res.json({ win: false, message: 'Hiện tại chưa có voucher nào để phát, quay lại sau nhé!' });
  }

  // Chọn random 1 voucher trong danh sách
  const randomVoucher = vouchers[Math.floor(Math.random() * vouchers.length)];

  // Kiểm tra user đã nhận voucher này chưa
  const existed = await VoucherDetail.findOne({ user: userId, voucher: randomVoucher._id });
  if (existed) {
    return res.json({ win: true, message: `Bạn đã từng nhận voucher này (${randomVoucher.code}), xem lại trong ví voucher của bạn nhé!` });
  }

  // Phát voucher cho user
  await VoucherDetail.create({
    user: userId,
    voucher: randomVoucher._id
  });

  res.json({ 
    win: true, 
    message: `Chúc mừng bạn đã trúng voucher ${randomVoucher.code}! Xem lại trong ví voucher của bạn.`,
    voucher: {
      code: randomVoucher.code,
      discountValue: randomVoucher.discountValue,
      discountType: randomVoucher.discountType,
      validTo: randomVoucher.validTo
    }
  });
});

module.exports = router;
