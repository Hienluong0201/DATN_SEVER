const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentSchema = new Schema({
  paymentMethod: { type: String, required: true },
  paymentGateway: { type: String },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
