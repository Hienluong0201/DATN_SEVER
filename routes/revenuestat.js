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
    const { groupBy = 'day', from, to, startDate, endDate } = req.query;

    const fromDateStr = from || startDate;
    const toDateStr   = to   || endDate;

    const start = fromDateStr ? new Date(fromDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end   = toDateStr   ? new Date(toDateStr)   : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const tz = 'Asia/Ho_Chi_Minh';
    const dateFormatMap = {
      day:   { $dateToString: { format: '%Y-%m-%d', date: '$orderDate', timezone: tz } },
      month: { $dateToString: { format: '%Y-%m',    date: '$orderDate', timezone: tz } },
      year:  { $dateToString: { format: '%Y',       date: '$orderDate', timezone: tz } },
    };
    const dateFormat = dateFormatMap[groupBy] || dateFormatMap.day;

    const summary = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end },
          // ✅ ĐÚNG với schema: orderStatus + chữ thường
          orderStatus: 'delivered',
        },
      },
      {
        $lookup: {
          from: 'payments',          // đảm bảo trùng tên collection thực tế của Payment
          localField: 'paymentID',
          foreignField: '_id',
          as: 'payment',
        },
      },
      { $unwind: { path: '$payment', preserveNullAndEmptyArrays: false } },

      // (Tuỳ chọn) Nếu Payment có field status, có thể lọc thêm:
      // { $match: { 'payment.status': { $in: ['succeeded', 'paid'] } } },

      // (Tuỳ chọn) Nếu có hoàn tiền:
      {
        $addFields: {
          netAmount: {
            $subtract: [
              '$payment.amount',
              { $ifNull: ['$payment.refundedAmount', 0] }
            ]
          }
        }
      },

      {
        $group: {
          _id: dateFormat,
          totalRevenue: { $sum: '$netAmount' },  // hoặc $sum: '$payment.amount' nếu không có refundedAmount
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
    ]).allowDiskUse(true);

    res.status(200).json({ data: summary });
  } catch (error) {
    console.error('Revenue summary error:', error);
    next(error);
  }
});



// 2. Doanh thu phân theo danh mục sản phẩm
// 2. Doanh thu phân theo danh mục sản phẩm (CHỈ ĐƠN ĐÃ GIAO)
router.get('/revenue/categories', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end   = endDate   ? new Date(endDate)   : new Date();
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const stats = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end },
          orderStatus: 'delivered', // ✅ chỉ tính đơn đã giao
        }
      },
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
    ]).allowDiskUse(true);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});


// 3. Doanh thu phân theo sản phẩm (có phân trang)
// GET /api/statistics/revenue/products?startDate=&endDate=&limit=&skip=
// GET /api/statistics/revenue/products?startDate=&endDate=&limit=&skip=
router.get('/revenue/products', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    let { limit = 20, skip = 0 } = req.query;

    // parse & clamp paging
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 1000);
    skip  = Math.max(parseInt(skip, 10) || 0, 0);

    // date range
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const stats = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end },
          orderStatus: 'delivered' // ✅ chỉ tính đơn đã giao
        }
      },
      { $unwind: '$items' },
      // join variant để lấy productID
      {
        $lookup: {
          from: 'productvariants',
          localField: 'items.variantID',
          foreignField: '_id',
          as: 'variant'
        }
      },
      { $unwind: '$variant' },
      // join product để lấy thông tin sp
      {
        $lookup: {
          from: 'products',
          localField: 'variant.productID',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      // group theo product
      {
        $group: {
          _id: '$product._id',
          name: { $first: '$product.name' },
          categoryID: { $first: '$product.categoryID' },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          sold: { $sum: '$items.quantity' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: 1,
          categoryID: 1,
          totalRevenue: 1,
          sold: 1
        }
      }
    ]).allowDiskUse(true);

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
    const { startDate, endDate } = req.query;
    let { limit = 10 } = req.query;

    // Ép kiểu & giới hạn an toàn
    limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 1000);

    // Chuẩn hóa mốc thời gian
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const stats = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end },
          orderStatus: 'delivered' // ✅ chỉ lấy đơn đã giao
        }
      },
      {
        $group: {
          _id: '$userID',
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$finalTotal' } // hoặc lookup payments nếu muốn tiền thu thực tế
        }
      },
      // Có thể ưu tiên xếp theo tổng chi tiêu:
      { $sort: { totalSpent: -1, orderCount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          orderCount: 1,
          totalSpent: 1
        }
      }
    ]).allowDiskUse(true);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});


// 6. Thống kê sản phẩm được yêu thích nhất (theo số lượng bán)
// GET /api/statistics/revenue/popular-products?startDate=&endDate=&limit=
// GET /api/statistics/revenue/popular-products?startDate=&endDate=&limit=
router.get('/revenue/popular-products', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    let   { limit = 100 } = req.query;

    // Ép kiểu & giới hạn an toàn
    limit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);

    // Chuẩn hóa mốc thời gian
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const stats = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end },
          orderStatus: 'delivered' // ✅ chỉ tính đơn đã giao
        }
      },
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
        $group: {
          _id: '$variant.productID',
          soldQuantity: { $sum: '$items.quantity' }
        }
      },
      { $sort: { soldQuantity: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: '$product.name',
          // Theo các route trước, trường là categoryID (không phải category)
          categoryID: '$product.categoryID',
          soldQuantity: 1
        }
      }
    ]).allowDiskUse(true);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});
// 7. Thống kê sản phẩm sắp hết hàng
// GET /api/statistics/inventory/low-stock?threshold=&limit=&skip=
router.get('/inventory/low-stock', async (req, res, next) => {
  try {
    const { threshold = 10, limit = 20, skip = 0 } = req.query;

    // Ép kiểu & giới hạn an toàn
    const stockThreshold = Math.max(parseInt(threshold, 10) || 10, 0);
    const queryLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 1000);
    const querySkip = Math.max(parseInt(skip, 10) || 0, 0);

    const lowStockProducts = await ProductVariant.aggregate([
      {
        $match: {
          stock: { $lte: stockThreshold },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: 'productID',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 0,
          variantId: '$_id',
          productId: '$product._id',
          productName: '$product.name',
          variantDescription: {
            $concat: [
              { $ifNull: ['$size', ''] },
              { $cond: { if: { $and: ['$size', '$color'] }, then: ' - ', else: '' } },
              { $ifNull: ['$color', ''] },
            ],
          },
          stock: 1,
          categoryID: '$product.categoryID',
        },
      },
      { $sort: { stock: 1 } },
      { $skip: querySkip },
      { $limit: queryLimit },
    ]).allowDiskUse(true);

    res.json({ data: lowStockProducts });
  } catch (err) {
    console.error('Low stock products error:', err);
    next(err);
  }
});

// 8. Thống kê sản phẩm ít người mua nhất
// GET /api/statistics/revenue/least-purchased?startDate=&endDate=&limit=&skip=
router.get('/inventory/status', async (req, res, next) => {
  try {
    const { limit = 20, skip = 0 } = req.query;

    const queryLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 1000);
    const querySkip = Math.max(parseInt(skip, 10) || 0, 0);

    const inventoryStatus = await ProductVariant.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: 'productID',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $addFields: {
          stockStatus: {
            $cond: {
              if: { $lte: ['$stock', 5] },
              then: 'critical',
              else: {
                $cond: {
                  if: { $lte: ['$stock', 20] },
                  then: 'low',
                  else: 'normal',
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          variantId: '$_id',
          productId: '$product._id',
          productName: '$product.name',
          variantDescription: {
            $concat: [
              { $ifNull: ['$size', ''] },
              { $cond: { if: { $and: ['$size', '$color'] }, then: ' - ', else: '' } },
              { $ifNull: ['$color', ''] },
            ],
          },
          stock: 1,
          stockStatus: 1,
          categoryID: '$product.categoryID',
        },
      },
      { $sort: { stock: 1 } },
      { $skip: querySkip },
      { $limit: queryLimit },
    ]).allowDiskUse(true);

    res.json({ data: inventoryStatus });
  } catch (err) {
    console.error('Inventory status error:', err);
    next(err);
  }
});

module.exports = router;
