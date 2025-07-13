const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // ❌ bỏ required
  phone: { type: String, unique: true }, // ❌ bỏ required
  img: { type: String },
  facebookId: { type: String, unique: true, sparse: true },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: { type: Boolean, default: true },
  resetPasswordCode: String,      
  resetPasswordExpires: Date,  
  otpCode: String, 
  otpExpires: Date 
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
