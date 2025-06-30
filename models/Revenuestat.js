const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RevenueStatSchema = new Schema({
  // Phân nhóm: day | month | year
  groupBy: {
    type: String,
    enum: ['day', 'month', 'year'],
    required: true
  },
  // Giá trị chuỗi thể hiện đơn vị thời gian, ví dụ '2025-06-23' | '2025-06' | '2025'
  period: {
    type: String,
    required: true
  },
  // Tổng doanh thu trong khoảng period
  totalRevenue: {
    type: Number,
    required: true,
    default: 0
  },
  // Số đơn hàng tương ứng
  orderCount: {
    type: Number,
    required: true,
    default: 0
  },
  // (Tuỳ chọn) Nếu bạn muốn ghi lại luôn khoảng ngày gốc
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  // Thời điểm record này được tạo ra
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Đảm bảo mỗi (groupBy, period) chỉ lưu một bản duy nhất
RevenueStatSchema.index({ groupBy: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('RevenueStat', RevenueStatSchema);
