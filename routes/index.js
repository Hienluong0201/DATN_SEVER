var express = require('express');
var router = express.Router();
const User = require('../models/User');

// Middleware kiểm tra vai trò admin
function isAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/'); // Chuyển hướng đến trang đăng nhập nếu chưa đăng nhập
  }

  User.findById(req.session.userId)
    .then(user => {
      if (!user) {
        return res.status(404).send('Không tìm thấy người dùng');
      }
      if (user.role !== 'admin') {
        return res.status(403).send('Bạn không có quyền truy cập trang admin');
      }
      req.user = user; // Lưu user vào request để sử dụng trong route
      next();
    })
    .catch(err => {
      res.status(500).send('Lỗi máy chủ: ' + err.message);
    });
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/* GET admin page. */
router.get('/admin', isAdmin, function(req, res, next) {
  res.render('admin', { title: 'Bảng Điều Khiển Admin', user: req.user });
});

module.exports = router;