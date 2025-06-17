const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true, unique: true  },
  img: { type: String },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  resetPasswordCode: String,      
  resetPasswordExpires: Date,  
  otpCode: String, 
  otpExpires: Date 
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
