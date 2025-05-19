const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CartSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productVariant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  soluong: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Cart', CartSchema);
