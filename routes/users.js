const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const axios = require('axios');
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

// Gửi OTP qua số điện thoại
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'Vui lòng nhập số điện thoại' });
    }

    // Kiểm tra xem số điện thoại đã được liên kết với tài khoản chưa
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: 'Số điện thoại chưa được đăng ký' });
    }

    // Tạo mã OTP 6 số ngẫu nhiên
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Lưu OTP và thời gian hết hạn vào database
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // OTP hết hạn sau 5 phút
    await user.save();

    // Gửi OTP qua API eSMS
    const smsData = {
      ApiKey: '5F36112B2D7D57EBA16673E3F76CCB',
      Content: `${otp} la ma xac minh dang ky Baotrixemay cua ban`, // Khớp với template đã xác nhận
      Phone: phone,
      SecretKey: 'A11953D374FA306EC42A20DE1F59DD',
      Brandname: 'Baotrixemay',
      SmsType: '2'
    };

    const response = await axios.post('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/', smsData, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.CodeResult !== '100') {
      return res.status(500).json({ message: 'Gửi OTP thất bại', error: response.data });
    }

    res.json({ message: 'Mã OTP đã được gửi đến số điện thoại' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});

// Đăng ký user mới (name, email, password, phone)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ name, email, password và phone' });
    }

    // Kiểm tra email đã tồn tại
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ message: 'Email đã được sử dụng' });
    }

    // Kiểm tra số điện thoại đã tồn tại
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({ message: 'Số điện thoại đã được sử dụng' });
    }

    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tạo user mới
    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      isActive: true
    });
    const savedUser = await user.save();

    res.status(201).json(savedUser);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});

// Đăng nhập (email với password hoặc phone với OTP), kèm phân quyền admin
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password, otp, admin } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!email && !phone) {
      return res.status(400).json({ message: 'Vui lòng nhập email hoặc số điện thoại' });
    }
    if (email && !password) {
      return res.status(400).json({ message: 'Vui lòng nhập mật khẩu' });
    }
    if (phone && !otp) {
      return res.status(400).json({ message: 'Vui lòng nhập mã OTP' });
    }

    // Tìm user theo email hoặc phone
    let user;
    if (email) {
      user = await User.findOne({ email });
    } else {
      user = await User.findOne({ phone });
    }

    if (!user) {
      return res.status(401).json({ message: 'Email hoặc số điện thoại không đúng' });
    }

    // Xác thực bằng password (email) hoặc OTP (phone)
    if (email) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Mật khẩu không đúng' });
      }
    } else {
      if (user.otpCode !== otp || !user.otpExpires || user.otpExpires < Date.now()) {
        return res.status(400).json({ message: 'Mã OTP không hợp lệ hoặc đã hết hạn' });
      }
      // Xóa OTP sau khi xác thực
      user.otpCode = undefined;
      user.otpExpires = undefined;
      await user.save();
    }

    // Kiểm tra tài khoản còn hoạt động (chỉ chặn với user thường, admin bỏ qua)
    if (!user.isActive && user.role !== 'admin') {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên' });
    }

    // Nếu client yêu cầu đăng nhập admin thì kiểm tra quyền
    if (admin) {
      if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập admin' });
      }
      req.session.userId  = user._id;
      req.session.isAdmin = true;
      return res.json({ message: 'Đăng nhập thành công với quyền Admin', user });
    }

    // Đăng nhập bình thường
    req.session.userId  = user._id;
    req.session.isAdmin = false;
    res.json({ message: 'Đăng nhập thành công', user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi máy chủ', error: err.message });
  }
});


// Gửi mã quên mật khẩu về email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Vui lòng nhập email' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Email không tồn tại' });
    }

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
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Thiếu thông tin cần thiết' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Email không tồn tại' });
    }

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
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    const updateFields = {};
    if (name) updateFields.name = name;
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone && existingPhone._id.toString() !== userId) {
        return res.status(409).json({ message: 'Số điện thoại đã được sử dụng' });
      }
      updateFields.phone = phone;
    }
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