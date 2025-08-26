const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RevenueStatSchema = new Schema({
  groupBy: {
    type: String,
    enum: ['day', 'month', 'year'],
    required: true
  },
  period: {
    type: String,
    required: true
  },
  totalRevenue: {
    type: Number,
    required: true,
    default: 0
  },
  orderCount: {
    type: Number,
    required: true,
    default: 0
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

RevenueStatSchema.index({ groupBy: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('RevenueStat', RevenueStatSchema);
