const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('../utils/cloudinary');
const sharp = require('sharp');

// Cấu hình multer upload file tạm vào thư mục 'uploads/'
const upload = multer({ dest: 'uploads/' });

// Nodemailer config
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Đăng ký user mới (name, email, password)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ name, email và password' });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(409).json({ message: 'Email đã được sử dụng' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({ name, email, password: hashedPassword, isActive: true });
    const savedUser = await user.save();

    res.status(201).json(savedUser);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});

// Đăng nhập (email, password) và kiểm tra isActive
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Vui lòng nhập email và password' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });

    if (!user.isActive)
      return res.status(403).json({ message: 'Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên' });

    res.json({ message: 'Đăng nhập thành công', user });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});

// Gửi mã quên mật khẩu về email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ message: 'Vui lòng nhập email' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: 'Email không tồn tại' });

    // Tạo mã 6 số ngẫu nhiên
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordCode = code;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 phút
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Mã xác thực quên mật khẩu',
      text: `Mã xác thực của bạn là: ${code}. Mã có hiệu lực trong 15 phút.`
    });

    res.json({ message: 'Mã xác thực đã được gửi đến email' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});

// Xác thực mã và đổi mật khẩu mới
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword)
      return res.status(400).json({ message: 'Thiếu thông tin cần thiết' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: 'Email không tồn tại' });

    if (
      user.resetPasswordCode !== code ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Mã xác thực không hợp lệ hoặc đã hết hạn' });
    }

    // Mã hóa password mới
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});

// Cập nhật user (name, password, phone, img)
router.put('/update/:id', upload.single('img'), async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, password, phone } = req.body;

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    const updateFields = {};
    if (name) updateFields.name = name;
    if (phone) updateFields.phone = phone;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    if (req.file) {
      const originalPath = req.file.path;
      const compressedPath = originalPath + '_compressed.jpg';
      const start = Date.now();
      await sharp(originalPath)
        .resize(600)
        .jpeg({ quality: 30 })
        .toFile(compressedPath);
      console.log('Sharp processing time:', Date.now() - start, 'ms');
    
      const result = await cloudinary.uploader.upload(compressedPath, {
        folder: 'user_images',
        use_filename: true,
      });
    
      fs.unlinkSync(originalPath);
      fs.unlinkSync(compressedPath);
    
      updateFields.img = result.secure_url;
    }
    
    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, { new: true });
    res.json({ message: 'Cập nhật thành công', user: updatedUser });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});
module.exports = router;
