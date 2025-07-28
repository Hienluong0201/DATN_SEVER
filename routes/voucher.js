const express = require('express');
const router  = express.Router();
const Voucher = require('../models/Voucher');
const Order   = require('../models/Order');

// 1. Tạo mới voucher
// POST /api/vouchers
router.post('/', async (req, res, next) => {
  try {
    const v = await Voucher.create(req.body);
    res.status(201).json({ data: v });
  } catch (err) {
    next(err);
  }
});
router.get('/public', async (req, res) => {
  try {
    const now = new Date();
    const vouchers = await Voucher.find({
      isActive: true,
      isPublic: true,            // chỉ voucher công khai mới hiện ra shop
      validFrom: { $lte: now },
      validTo: { $gte: now }
    }).sort({ createdAt: -1 });

    res.json({ data: vouchers });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy voucher public', error: err.message });
  }
});

// 2. Lấy danh sách voucher (filter, search, phân trang)
// GET /api/vouchers?active=true&page=1&limit=20&search=CODE
router.get('/', async (req, res, next) => {
  try {
    const { active, page = 1, limit = 20, search = "" } = req.query;
    const filter = {};
    if (active !== undefined) filter.isActive = active === 'true';
    if (search) filter.code = { $regex: search, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const list = await Voucher.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));
    const total = await Voucher.countDocuments(filter);

    res.json({ data: list, total });
  } catch (err) {
    next(err);
  }
});

// 3. Lấy chi tiết voucher
// GET /api/vouchers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const v = await Voucher.findById(req.params.id);
    if (!v) return res.status(404).json({ error: 'Voucher không tồn tại' });
    res.json({ data: v });
  } catch (err) {
    next(err);
  }
});

// 4. Cập nhật voucher
// PUT /api/vouchers/:id
router.put('/:id', async (req, res, next) => {
  try {
    const v = await Voucher.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!v) return res.status(404).json({ error: 'Voucher không tồn tại' });
    res.json({ data: v });
  } catch (err) {
    next(err);
  }
});

// 5. Xóa (hoặc deactivate) voucher
// DELETE /api/vouchers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    // chỉ set isActive = false thay vì xóa cứng
    const v = await Voucher.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!v) return res.status(404).json({ error: 'Voucher không tồn tại' });
    res.json({ data: v });
  } catch (err) {
    next(err);
  }
});

// 6. Khôi phục voucher bị deactivate
// PATCH /api/vouchers/:id/restore
router.patch('/:id/restore', async (req, res, next) => {
  try {
    const v = await Voucher.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!v) return res.status(404).json({ error: 'Voucher không tồn tại' });
    res.json({ data: v });
  } catch (err) {
    next(err);
  }
});


// 5. Xóa (hoặc deactivate) voucher
// DELETE /api/vouchers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    // có thể chỉ set isActive = false thay vì xóa hẳn
    const v = await Voucher.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!v) return res.status(404).json({ error: 'Voucher không tồn tại' });
    res.json({ data: v });
  } catch (err) {
    next(err);
  }
});

// 6. Áp voucher cho đơn hàng
// POST /api/vouchers/apply
// Body: { orderId: "...", code: "ABC123" }
router.post('/apply', async (req, res, next) => {
  try {
    const { orderId, code } = req.body;
    const voucher = await Voucher.findOne({ code: code.trim().toUpperCase(), isActive: true });
    if (!voucher) return res.status(404).json({ error: 'Voucher không hợp lệ hoặc đã hết hạn' });

    // kiểm tra ngày
    const now = new Date();
    if (now < voucher.validFrom || now > voucher.validTo) {
      return res.status(400).json({ error: 'Voucher chưa đến ngày sử dụng hoặc đã hết hạn' });
    }

    // kiểm tra quota
    if (voucher.usedCount >= voucher.usageLimit) {
      return res.status(400).json({ error: 'Voucher đã đạt giới hạn sử dụng' });
    }

    // lấy đơn hàng
    const order = await Order.findById(orderId).populate('items.product');
    if (!order) return res.status(404).json({ error: 'Đơn hàng không tồn tại' });

    // tính total order
    const orderTotal = order.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
    if (orderTotal < voucher.minOrderValue) {
      return res.status(400).json({ error: `Đơn tối thiểu phải từ ${voucher.minOrderValue}` });
    }

    // kiểm tra áp dụng category/product nếu đặt
    if (voucher.applicableCategories?.length) {
      const has = order.items.some(i => voucher.applicableCategories.includes(i.product.category));
      if (!has) return res.status(400).json({ error: 'Không có sản phẩm phù hợp để áp voucher' });
    }
    if (voucher.applicableProducts?.length) {
      const hasProd = order.items.some(i => 
        voucher.applicableProducts.some(pid => pid.equals(i.product._id))
      );
      if (!hasProd) return res.status(400).json({ error: 'Không có sản phẩm phù hợp để áp voucher' });
    }

    // tính giảm giá
    let discount = 0;
    if (voucher.discountType === 'percent') {
      discount = orderTotal * (voucher.discountValue / 100);
    } else {
      discount = voucher.discountValue;
    }
    const newTotal = Math.max(0, orderTotal - discount);

    // cập nhật usedCount
    voucher.usedCount += 1;
    if (voucher.usedCount >= voucher.usageLimit) voucher.isActive = false;
    await voucher.save();

    // trả về kết quả
    res.json({
      data: {
        orderId,
        code: voucher.code,
        discount,
        originalTotal: orderTotal,
        newTotal
      }
    });
  } catch (err) {
    next(err);
  }
});
// 8. Lịch sử sử dụng voucher (tuỳ hệ thống!)
// Giả sử bạn lưu lịch sử dùng voucher ở collection Order (mỗi order lưu code voucher đã dùng)
// GET /api/vouchers/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const code = req.params.id.trim().toUpperCase();

    const voucher = await Voucher.findOne({ code });
    if (!voucher) {
      return res.status(404).json({ message: "Không tìm thấy voucher" });
    }

    const orders = await Order.find({ voucher: voucher._id })
      .populate("userID", "name email") // lấy info người dùng
      .populate("voucher", "code discountValue"); // optional

    // Thống kê người dùng duy nhất đã dùng voucher
    const userStatsMap = new Map();

    orders.forEach(order => {
      const user = order.userID;
      if (!user || !user._id) return;

      const userId = user._id.toString();
      if (!userStatsMap.has(userId)) {
        userStatsMap.set(userId, {
          userID: userId,
          name: user.name,
          email: user.email,
          count: 1
        });
      } else {
        userStatsMap.get(userId).count += 1;
      }
    });

    const userStats = Array.from(userStatsMap.values());

    // Trả về kết quả gồm danh sách đơn hàng & thống kê
    res.json({
      voucher: {
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        usageLimit: voucher.usageLimit,
        usedCount: voucher.usedCount,
      },
      totalOrders: orders.length,
      uniqueUsers: userStats.length,
      userStats: userStats,
      orders: orders, // có thể bỏ nếu không cần chi tiết đơn
    });
  } catch (err) {
    next(err);
  }
});
router.get('/public', async (req, res) => {
  try {
    const now = new Date();
    const vouchers = await Voucher.find({
      isActive: true,
      isPublic: true,            // chỉ voucher công khai mới hiện ra shop
      validFrom: { $lte: now },
      validTo: { $gte: now }
    }).sort({ createdAt: -1 });

    res.json({ data: vouchers });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy voucher public', error: err.message });
  }
});

module.exports = router;
