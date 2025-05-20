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
    required: true,
    validate: {
      validator: function(urls) {
        // Đảm bảo mảng có ít nhất 1 phần tử
        return urls && urls.length > 0;
      },
      message: 'Phải có ít nhất một đường dẫn ảnh'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Image', ImageSchema);