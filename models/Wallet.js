const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const WalletSchema = new Schema({
  userID: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true  // mỗi user chỉ có 1 ví
  },
  balance: {
    type: Number,
    default: 0,  // số dư ban đầu
    min: 0
  },
  transactions: [
    {
      paymentID: { type: Schema.Types.ObjectId, ref: 'Payment' },
      type: { type: String, enum: ['deposit', 'withdraw'], required: true },
      amount: { type: Number, required: true },
      date: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Wallet', WalletSchema);
