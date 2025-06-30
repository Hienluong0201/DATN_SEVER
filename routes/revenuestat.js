const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');

const Order            = require('../models/Order');
const Product          = require('../models/Product');
const ProductVariant   = require('../models/ProductVariant');
const User             = require('../models/User');

// 1. Thống kê tổng doanh thu theo ngày/tháng/năm
// GET /api/statistics/revenue/summary?startDate=&endDate=&groupBy=day|month|year
tool: router.get('/revenue/summary', async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();

    const dateFormats = {
      day:   { $dateToString: { format: '%Y-%m-%d', date: '$orderDate' } },
      month: { $dateToString: { format: '%Y-%m',    date: '$orderDate' } },
      year:  { $dateToString: { format: '%Y',       date: '$orderDate' } },
    };
    const periodField = dateFormats[groupBy] || dateFormats.day;

    const stats = await Order.aggregate([
      { $match: { orderDate: { $gte: start, $lte: end } } },
      { $lookup: {
          from: 'payments',
          localField: 'paymentID',
          foreignField: '_id',
          as: 'payment'
      }},
      { $unwind: '$payment' },
      { $group: {
          _id: periodField,
          totalRevenue: { $sum: '$payment.amount' },
          orderCount:   { $sum: 1 }
      }},
      { $project: {
          _id: 0,
          period: '$_id',
          totalRevenue: 1,
          orderCount: 1
      }},
      { $sort: { period: 1 } }
    ]);

    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

// 2. Doanh thu phân theo danh mục sản phẩm
// GET /api/statistics/revenue/categories?startDate=&endDate=
router.get('/revenue/categories', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const end   = endDate   ? new Date(endDate)   : new Date();

    const stats = await Order.aggregate([
      { $match: { orderDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      { $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'prod'
      }},
      { $unwind: '$prod' },
      { $group: {
          _id: '$prod.category',
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          itemsSold:    { $sum: '$items.quantity' }
      }},
      { $project: {
          _id: 0,
          category: '$_id',
          totalRevenue: 1,
          itemsSold: 1
      }},
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
router.get('/revenue/orders/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'Invalid orderId' });
    }

    const order = await Order.findById(orderId)
      .populate('paymentID')
      .populate({
        path: 'items.product',
        select: 'name category price'
      })
      .lean();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const detail = {
      orderId:   order._id,
      orderDate: order.orderDate,
      status:    order.orderStatus,
      customer:  { name: order.name, phone: order.sdt },
      shippingAddress: order.shippingAddress,
      items: order.items.map(i => ({
        productId:   i.product._id,
        name:        i.product.name,
        category:    i.product.category,
        unitPrice:   i.price,
        quantity:    i.quantity,
        lineRevenue: i.price * i.quantity
      })),
      payment: {
        method: order.paymentID.paymentMethod,
        amount: order.paymentID.amount,
        paidAt:  order.paymentID.paidAt
      },
      totalRevenue: order.paymentID.amount
    };

    res.json({ data: detail });
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
    const { startDate, endDate, limit = 10 } = req.query;
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
