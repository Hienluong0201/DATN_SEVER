const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VoucherSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,     // unique sẽ tự tạo index duy nhất cho code
    uppercase: true,
    trim: true
  },
  discountType: {
    type: String,
    enum: ['percent', 'fixed'],   // percent = giảm %, fixed = giảm tiền cố định
    required: true
  },
  discountValue: {
    type: Number,
    required: true,               // nếu percent: 10 → 10%; nếu fixed: 50000 → 50.000đ
    min: 0
  },
  usageLimit: {
    type: Number,
    default: 1                    // tổng số lần voucher được dùng
  },
  usedCount: {
    type: Number,
    default: 0
  },
  minOrderValue: {
    type: Number,
    default: 0                    // đơn tối thiểu để áp voucher
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTo: {
    type: Date,
    required: true
  },
  applicableCategories: [String], // nếu chỉ áp cho 1 số category
  applicableProducts: [{          // hoặc chỉ áp cho 1 số product
    type: Schema.Types.ObjectId,
    ref: 'Product'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });



module.exports = mongoose.model('Voucher', VoucherSchema);
