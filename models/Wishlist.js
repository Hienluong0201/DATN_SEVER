const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const WishlistSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: Schema.Types.ObjectId, ref: 'Product', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', WishlistSchema);
