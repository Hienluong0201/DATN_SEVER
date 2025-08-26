const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReviewSchema = new Schema({
  userID:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  comment:   { type: String },
  reviewDate:{ type: Date, default: Date.now },

  status:    { type: Boolean, default: true },
  images:    [{ type: String }],

  editCount:    { type: Number, default: 0 },   
  lastEditedAt: { type: Date },
}, {
  timestamps: { createdAt: 'reviewDate', updatedAt: 'updatedAt' }
});

ReviewSchema.index({ userID: 1, productID: 1 }, { unique: true, name: 'uniq_user_product' });

module.exports = mongoose.model('Review', ReviewSchema);
