// models/Video.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VideoSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // Người đăng video
  videoURL: { type: String, required: true }, // URL video trên Cloudinary
  thumbnailURL: { type: String }, // URL ảnh thumbnail (tùy chọn)
  caption: { type: String }, // Mô tả video
  products: [{ type: Schema.Types.ObjectId, ref: 'Product' }], // Danh sách sản phẩm gắn với video
  status: { type: Boolean, default: true }, // Trạng thái (hiển thị hay ẩn)
  views: { type: Number, default: 0 }, // Số lượt xem
  likes: [{ type: Schema.Types.ObjectId, ref: 'User' }], // Danh sách user đã like
}, { timestamps: true });

module.exports = mongoose.model('Video', VideoSchema);