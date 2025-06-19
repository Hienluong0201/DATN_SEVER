const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductSchema = new Schema({
  categoryID: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  status: { type: Boolean, default: true },
   image:       { type: mongoose.Schema.Types.ObjectId, ref: "Img" }  // tham chiếu đến Img
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);
