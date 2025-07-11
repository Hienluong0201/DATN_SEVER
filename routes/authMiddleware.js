// middleware/authMiddleware.js
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Bạn chưa đăng nhập" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Tài khoản không hợp lệ" });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ message: "Lỗi xác thực", error: err.message });
  }
};

module.exports = authMiddleware;
