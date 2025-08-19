const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ImageSchema = new Schema({
  productID: { 
    type: Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  imageURL: { 
    type: [String], 
    default: [],
    required: false 
  },
  videoURL: {
    type: [String], 
    default: [],
    required: false 
  }
}, { timestamps: true });

module.exports = mongoose.model('Image', ImageSchema);
