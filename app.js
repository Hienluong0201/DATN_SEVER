var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mongoose = require('mongoose');
require('dotenv').config();

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var productsRouter = require('./routes/product');
var imgsRouter = require('./routes/Img');
var categoryRouter = require('./routes/category');
var addressRouter = require('./routes/adress');
var session = require('express-session');
var wishlistRouter = require('./routes/wishlist');
var cartRouter = require('./routes/cart');
var orderRouter = require('./routes/order');
var orderdetailRouter = require('./routes/orderdetail');
var productvariantRouter = require('./routes/productvariant');
var paymentRouter = require('./routes/payment');
var reviewRouter = require('./routes/review');
var messageRouter = require('./routes/message');
const videoRouter = require('./routes/video');
var statisticsRoter = require('./routes/revenuestat');
var voucherRouter = require('./routes/voucher');
var voucherRouterDetail = require('./routes/voucherDetail')


var app = express();

var cors = require('cors');
app.use(cors());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Kết nối MongoDB
mongoose.connect('mongodb+srv://hienluong:hienluong123@cluster0.exwm8.mongodb.net/DATN_NHOM5')
  .then(() => console.log('>>>>>>>>>> DB Connected!!!!!!'))
  .catch(err => console.log('>>>>>>>>> DB Error: ', err));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


// Cấu hình session
app.use(session({
  secret: 'oke123', // Thay bằng một chuỗi bí mật mạnh hơn
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Đặt secure: true nếu dùng HTTPS
}));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/products', productsRouter);
app.use('/category', categoryRouter);
app.use('/adress', addressRouter);
app.use('/img', imgsRouter);
app.use('/wishlist', wishlistRouter);
app.use('/cart', cartRouter);
app.use('/order', orderRouter);
app.use('/orderdetail', orderdetailRouter);
app.use('/productvariant', productvariantRouter);
app.use('/payment', paymentRouter);
app.use('/review', reviewRouter);
app.use('/messages', messageRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/statistics',statisticsRoter);
app.use('/voucher',voucherRouter);
app.use('/voucherDetail',voucherRouterDetail);
app.use('/api/push', require('./routes/push'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;