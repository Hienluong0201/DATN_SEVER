const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');

const Order            = require('../models/Order');
const Product          = require('../models/Product');
const ProductVariant   = require('../models/ProductVariant');
const User             = require('../models/User');

// 1. Thống kê tổng doanh thu theo ngày/tháng/năm
// GET /api/statistics/revenue/summary?startDate=&endDate=&groupBy=day|month|year

router.get('/revenue/summary', async (req, res, next) => {
  try {
    // Lấy query params
    const { groupBy = 'day', from, to, startDate, endDate } = req.query;

    // Ưu tiên 'from' và 'to' (hỗ trợ frontend React), fallback về startDate/endDate
    const fromDateStr = from || startDate;
    const toDateStr = to || endDate;

    // Xử lý ngày bắt đầu và kết thúc với độ chính xác cao
    const start = fromDateStr ? new Date(fromDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = toDateStr ? new Date(toDateStr) : new Date();

    // Đảm bảo start 00:00:00 và end 23:59:59
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Cấu hình format thời gian theo groupBy
    const dateFormatMap = {
      day: { $dateToString: { format: '%Y-%m-%d', date: '$orderDate' } },
      month: { $dateToString: { format: '%Y-%m', date: '$orderDate' } },
      year: { $dateToString: { format: '%Y', date: '$orderDate' } },
    };
    const dateFormat = dateFormatMap[groupBy] || dateFormatMap.day;

    // Aggregation pipeline
    const summary = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: 'payments',
          localField: 'paymentID',
          foreignField: '_id',
          as: 'payment',
        },
      },
      { $unwind: '$payment' },
      {
        $group: {
          _id: dateFormat,
          totalRevenue: { $sum: '$payment.amount' },
          orderCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          totalRevenue: 1,
          orderCount: 1,
        },
      },
      { $sort: { period: 1 } },
    ]);

    res.status(200).json({ data: summary });
  } catch (error) {
    console.error('Revenue summary error:', error);
    next(error);
  }
});



// 2. Doanh thu phân theo danh mục sản phẩm
// GET /api/statistics/revenue/categories?startDate=&endDate=
router.get('/revenue/categories', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 ngày trước
    const end = endDate ? new Date(endDate) : new Date();

   const stats = await Order.aggregate([
  { $match: { orderDate: { $gte: start, $lte: end } } },
  { $unwind: '$items' },
  {
    $lookup: {
      from: 'productvariants',
      localField: 'items.variantID',
      foreignField: '_id',
      as: 'variant'
    }
  },
  { $unwind: '$variant' },
  {
    $lookup: {
      from: 'products',
      localField: 'variant.productID',
      foreignField: '_id',
      as: 'product'
    }
  },
  { $unwind: '$product' },
  {
    $group: {
      _id: '$product.categoryID',
      totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
      itemsSold: { $sum: '$items.quantity' }
    }
  },
  {
    $lookup: {
      from: 'categories',
      localField: '_id',
      foreignField: '_id',
      as: 'categoryInfo'
    }
  },
  { $unwind: '$categoryInfo' },
  {
    $project: {
      _id: 0,
      categoryID: '$_id',
      categoryName: '$categoryInfo.name',
      totalRevenue: 1,
      itemsSold: 1
    }
  },
  { $sort: { totalRevenue: -1 } }
]);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// 3. Doanh thu phân theo sản phẩm (có phân trang)
// GET /api/statistics/revenue/products?startDate=&endDate=&limit=&skip=
router.get('/revenue/products', async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 20, skip = 0 } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();

    const stats = await Order.aggregate([
      { $match: { orderDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      { $group: {
          _id: '$items.product',
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          sold:         { $sum: '$items.quantity' }
      }},
      { $sort: { totalRevenue: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) },
      { $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
      }},
      { $unwind: '$product' },
      { $project: {
          _id: 0,
          productId: '$_id',
          name:      '$product.name',
          category:  '$product.category',
          totalRevenue: 1,
          sold: 1
      }}
    ]);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// 4. Thông tin chi tiết doanh thu của một đơn hàng cụ thể
// GET /api/statistics/revenue/orders/:orderId
router.get('/revenue/products', async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 20, skip = 0 } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await Order.aggregate([
      { $match: { orderDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },

      // 🔍 Join với ProductVariant để lấy productID
      {
        $lookup: {
          from: 'productvariants',
          localField: 'items.variantID',
          foreignField: '_id',
          as: 'variant'
        }
      },
      { $unwind: '$variant' },

      // 🔍 Join với Product để lấy thông tin sản phẩm
      {
        $lookup: {
          from: 'products',
          localField: 'variant.productID',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },

      // 📊 Gom theo sản phẩm
      {
        $group: {
          _id: '$product._id',
          name: { $first: '$product.name' },
          category: { $first: '$product.categoryID' },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          sold: { $sum: '$items.quantity' }
        }
      },

      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: 1,
          category: 1,
          totalRevenue: 1,
          sold: 1
        }
      },

      { $sort: { totalRevenue: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) }
    ]);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// 5. Thống kê người mua nhiều nhất
// GET /api/statistics/revenue/top-buyers?startDate=&endDate=&limit=
router.get('/revenue/top-buyers', async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();

    const stats = await Order.aggregate([
      { $match: { orderDate: { $gte: start, $lte: end } } },
      { $group: {
          _id: '$userID',
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$finalTotal' }
      }},
      { $sort: { orderCount: -1 } },
      { $limit: parseInt(limit) },
      { $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
      }},
      { $unwind: '$user' },
      { $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          orderCount: 1,
          totalSpent: 1
      }}
    ]);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// 6. Thống kê sản phẩm được yêu thích nhất (theo số lượng bán)
// GET /api/statistics/revenue/popular-products?startDate=&endDate=&limit=
router.get('/revenue/popular-products', async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 100 } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();

    const stats = await Order.aggregate([
      { $match: { orderDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      { $lookup: {
          from: 'productvariants',
          localField: 'items.variantID',
          foreignField: '_id',
          as: 'variant'
      }},
      { $unwind: '$variant' },
      { $group: {
          _id: '$variant.productID',
          soldQuantity: { $sum: '$items.quantity' }
      }},
      { $sort: { soldQuantity: -1 } },
      { $limit: parseInt(limit) },
      { $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
      }},
      { $unwind: '$product' },
      { $project: {
          _id: 0,
          productId: '$_id',
          name: '$product.name',
          category: '$product.category',
          soldQuantity: 1
      }}
    ]);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
