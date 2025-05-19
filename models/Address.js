const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AddressSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  address: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  name: { type: String, required: true },
  sdt: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Address', AddressSchema);
