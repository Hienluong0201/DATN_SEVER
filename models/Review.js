const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReviewSchema = new Schema({
  userID:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  comment:   { type: String },

  // Dùng createdAt = reviewDate để đỡ trùng với createdAt mặc định
  reviewDate:{ type: Date, default: Date.now },

  status:    { type: Boolean, default: true },
  images:    [{ type: String }],

  // --- Thêm để giới hạn 1 lần sửa ---
  editCount:    { type: Number, default: 0 },   // sẽ tăng lên 1 sau lần sửa
  lastEditedAt: { type: Date },
}, {
  // ánh xạ timestamps để giữ nguyên reviewDate bạn đang dùng để sort
  timestamps: { createdAt: 'reviewDate', updatedAt: 'updatedAt' }
});

// Mỗi user chỉ được 1 review cho mỗi product
ReviewSchema.index({ userID: 1, productID: 1 }, { unique: true, name: 'uniq_user_product' });

module.exports = mongoose.model('Review', ReviewSchema);
