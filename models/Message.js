const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: String, enum: ['user', 'admin'], required: true },
  text: { type: String, default: '' },
  type: { type: String, default: 'text' },
  orderInfo: { type: Object, default: null },  
  productInfo: { type: Object, default: null }, 
  timestamp: { type: Date, default: Date.now },
  replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null }
});

module.exports = mongoose.model('Message', MessageSchema);
