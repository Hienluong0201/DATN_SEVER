const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductVariantSchema = new Schema({
  productID: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  size: { type: String },
  color: { type: String },
  stock: { type: Number, required: true },
  images: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('ProductVariant', ProductVariantSchema);
