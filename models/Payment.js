const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentSchema = new Schema({
  amount: { type: Number, required: true }, 
  paymentMethod: { type: String, required: true },
  paymentGateway: { type: String },
  status: { type: String, default: 'pending' },
  app_trans_id: { type: String },          
  createdAt: { type: Date, default: Date.now }, 

  // THÊM TỐI THIỂU (không bắt buộc) để khớp code retry:
  userID: { type: Schema.Types.ObjectId, ref: 'User' }, 
  isPaid: { type: Boolean, default: false },            

  // Stripe retry
  stripePaymentIntentId: { type: String },
  stripeClientSecret: { type: String },
  stripeStatus: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
