const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ImageSchema = new Schema({
  productID: { 
    type: Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  imageURL: { 
    type: [String], // Mảng các đường dẫn ảnh
    default: [],    // Mặc định là mảng rỗng
    required: false // Không bắt buộc
  },
  videoURL: {
    type: [String], // Mảng các đường dẫn video
    default: [],    // Mặc định là mảng rỗng
    required: false // Không bắt buộc
  }
}, { timestamps: true });

module.exports = mongoose.model('Image', ImageSchema);
