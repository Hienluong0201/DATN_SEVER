const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: String, enum: ['user', 'admin'], required: true },
  text: { type: String, default: '' },
  type: { type: String, default: 'text' }, // text | order | product
  orderInfo: { type: Object, default: null },    // Gửi đơn hàng
  productInfo: { type: Object, default: null },  // Gửi sản phẩm
  timestamp: { type: Date, default: Date.now },
  replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null }
});

module.exports = mongoose.model('Message', MessageSchema);
