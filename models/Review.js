const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReviewSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  rating: { type: Number, required: true },
  comment: { type: String },
  reviewDate: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);
