const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentSchema = new Schema({
    amount: {            // thêm trường này để lưu số tiền thanh toán (VNĐ)
    type: Number,
    required: true
  },
  paymentMethod: { type: String, required: true },
  paymentGateway: { type: String },
  status: { type: String, default: 'pending' },
  app_trans_id: { type: String }, 
  createdAt: { type: Date, default: Date.now }
  
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
