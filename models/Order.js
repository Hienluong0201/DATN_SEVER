const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrderSchema = new Schema({
  userID: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  paymentID: {
    type: Schema.Types.ObjectId,
    ref: 'Payment',
    required: true
  },
  shippingAddress: {
    type: String,
    required: true
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  name: {
    type: String,
    required: true
  },
  sdt: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
