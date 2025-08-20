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
  },
  // Mảng sản phẩm trong đơn
  items: [{
    variantID: {
      type: Schema.Types.ObjectId,
      ref: 'ProductVariant',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  // Tổng tiền gốc của đơn (sum items price * quantity)
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // Số tiền đã giảm do voucher
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Tổng tiền sau khi áp voucher
  finalTotal: {
    type: Number,
    required: true,
    min: 0
  },
  // Tham chiếu đến voucher nếu có
  voucher: {
    type: Schema.Types.ObjectId,
    ref: 'Voucher',
    default: null
  },
  cancellationReason: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
