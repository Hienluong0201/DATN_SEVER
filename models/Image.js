const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ImageSchema = new Schema({
  variantID: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  imageURL: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Image', ImageSchema);
