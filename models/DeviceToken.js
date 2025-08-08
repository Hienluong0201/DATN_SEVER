const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DeviceTokenSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true, index: true },
  platform: { type: String, enum: ['expo','ios','android','web'], default: 'expo' },
}, { timestamps: true });

module.exports = mongoose.model('DeviceToken', DeviceTokenSchema);
