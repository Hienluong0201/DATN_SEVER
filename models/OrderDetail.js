const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrderDetailSchema = new Schema({
  variantID: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  orderID: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('OrderDetail', OrderDetailSchema);
