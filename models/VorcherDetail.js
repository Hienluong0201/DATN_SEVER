const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VoucherDetailSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  voucher: {
    type: Schema.Types.ObjectId,
    ref: 'Voucher',
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date
  },
  assignedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('VoucherDetail', VoucherDetailSchema);
