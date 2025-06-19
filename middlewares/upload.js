const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../utils/cloudinary');

// Cấu hình lưu trữ cho ảnh
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'user_images', // Thư mục mặc định cho ảnh (avatar, sản phẩm)
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }], // Tối ưu hóa chất lượng ảnh
  },
});

// Cấu hình lưu trữ cho video
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'upload_videos', // Thư mục cho video
    resource_type: 'video', // Chỉ định loại tài nguyên là video
    allowed_formats: ['mp4', 'mov', 'avi'],
    transformation: [{ quality: 'auto', video_codec: 'auto' }], // Tối ưu hóa video
  },
});

// Middleware cho ảnh
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB cho ảnh
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Chỉ hỗ trợ định dạng jpg, jpeg, png'), false);
    }
    cb(null, true);
  },
});

// Middleware cho video
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // Giới hạn 100MB cho video
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/mov', 'video/avi'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Chỉ hỗ trợ định dạng mp4, mov, avi'), false);
    }
    cb(null, true);
  },
});

module.exports = { uploadImage, uploadVideo };