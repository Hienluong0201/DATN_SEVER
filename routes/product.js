const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Product = require("../models/Product");
const Review = require('../models/Review');
const Image    = require("../models/Image");  
const Category = require("../models/Category"); 

// GET /api/products (lọc, sắp xếp, trang, và trả về ảnh)

router.get("/", async (req, res) => {
  try {
    const { categoryID, name, sort, page = 1, limit = 10, status } = req.query;
    const filter = {};

    // 1) Build filter như cũ
    if (categoryID && mongoose.Types.ObjectId.isValid(categoryID.trim())) {
      filter.categoryID = new mongoose.Types.ObjectId(categoryID.trim());
    }
    if (name) {
      filter.name = { $regex: name.trim(), $options: "i" };
    }
    if (status !== undefined) {
      filter.status = status === "true";
    }

    // 2) Build sort & pagination
    const sortOption = {};
    if (sort === "price_asc") sortOption.price = 1;
    else if (sort === "price_desc") sortOption.price = -1;
    const skip = (page - 1) * limit;

    // 3) Lấy products
    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // 4) Lấy tất cả ảnh và video của các product này
    const productIds = products.map((p) => p._id);
    const imageDocs = await Image.find({
      productID: { $in: productIds },
    }).lean();

    // 5) Gom nhóm imageURL & videoURL theo productID
    const host = `${req.protocol}://${req.get("host")}`;
    // Map ảnh
    const imageMap = imageDocs.reduce((acc, img) => {
      const key = img.productID.toString();
      const urls = img.imageURL.map((file) =>
        file.startsWith("http") ? file : `${host}/images/${file}`
      );
      if (!acc[key]) acc[key] = [];
      acc[key].push(...urls);
      return acc;
    }, {});
    // Map video
    const videoMap = imageDocs.reduce((acc, img) => {
      const key = img.productID.toString();
      const urls = (img.videoURL || []).map((file) =>
        file.startsWith("http") ? file : `${host}/videos/${file}`
      );
      if (!acc[key]) acc[key] = [];
      acc[key].push(...urls);
      return acc;
    }, {});

    // Lấy average rating từ Review
    const reviewAgg = await Review.aggregate([
      { $match: { productID: { $in: productIds } } },
      {
        $group: {
          _id: "$productID",
          averageRating: { $avg: "$rating" },
        },
      },
    ]);

    const ratingMap = reviewAgg.reduce((acc, item) => {
      acc[item._id.toString()] = item.averageRating;
      return acc;
    }, {});

    // Gán images, videos và rating vào mỗi product
    products.forEach((p) => {
      const key = p._id.toString();
      p.images = imageMap[key] || [];
      p.videos = videoMap[key] || [];
      p.averageRating = Math.round((ratingMap[key] || 0) * 10) / 10;
    });

    // Count + trả về
    const total = await Product.countDocuments(filter);
    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      products,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products (thêm sản phẩm)
router.post("/", async (req, res) => {
  try {
    const { categoryID, name, description, price, status } = req.body;

    if (!categoryID || !name || !price) {
      return res.status(400).json({ message: "Thiếu dữ liệu cần thiết." });
    }

    const newProduct = new Product({
      categoryID,
      name,
      description,
      price,
      status,
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/products/:id (sửa sản phẩm)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryID, name, description, price, status } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });

    if (categoryID) product.categoryID = categoryID;
    if (name) product.name = name;
    if (description) product.description = description;
    if (price) product.price = price;
    if (status !== undefined) product.status = status;

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id (xoá sản phẩm)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { status: false },   // Soft delete
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });
    res.json({ message: "Đã xoá (mềm) sản phẩm thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// routes/products.js
router.get("/advanced-search", async (req, res) => {
  try {
    const {
      categoryName,
      name,
      sort,
      status,
      page = 1,
      limit = 10,
      minPrice,
      maxPrice,
      minRating = 0,
    } = req.query;

    const filter = {};

    // ✅ Nếu có tên danh mục thì tìm ID trước
    if (categoryName) {
      const foundCategory = await Category.findOne({ name: { $regex: categoryName.trim(), $options: "i" } });
      if (foundCategory) {
        filter.categoryID = foundCategory._id;
      } else {
        return res.json({
          total: 0,
          page: Number(page),
          limit: Number(limit),
          products: [],
        });
      }
    }

    // 🔍 Tìm theo tên sản phẩm
    if (name) {
      filter.name = { $regex: name.trim(), $options: "i" };
    }

    // Lọc status
    if (status !== undefined) {
      filter.status = status === "true";
    }

    // Giá
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Sắp xếp
    const sortOption = {};
    if (sort === "price_asc") sortOption.price = 1;
    else if (sort === "price_desc") sortOption.price = -1;

    const skip = (page - 1) * limit;

    // Lấy danh sách sản phẩm
    const products = await Product.find(filter)
     .populate('categoryID', 'name') // ✅ Lấy tên category
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const productIds = products.map((p) => p._id);

    // Ảnh
    const host = `${req.protocol}://${req.get("host")}`;
    const imageDocs = await Image.find({ productID: { $in: productIds } }).lean();
    const imageMap = imageDocs.reduce((acc, img) => {
      const key = img.productID.toString();
      const urls = img.imageURL.map((file) =>
        file.startsWith("http") ? file : `${host}/images/${file}`
      );
      if (!acc[key]) acc[key] = [];
      acc[key].push(...urls);
      return acc;
    }, {});

    // Rating
    const reviewAgg = await Review.aggregate([
      { $match: { productID: { $in: productIds } } },
      {
        $group: {
          _id: "$productID",
          averageRating: { $avg: "$rating" },
        },
      },
    ]);

    const ratingMap = reviewAgg.reduce((acc, item) => {
      acc[item._id.toString()] = item.averageRating;
      return acc;
    }, {});

    // Gán rating + image + lọc minRating
    const filteredProducts = products
      .map((p) => {
        const id = p._id.toString();
        const avgRating = Math.round((ratingMap[id] || 0) * 10) / 10;
        return {
          ...p,
          images: imageMap[id] || [],
          averageRating: avgRating,
        };
      })
      .filter((p) => p.averageRating >= Number(minRating));

    const total = await Product.countDocuments(filter);

    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      products: filteredProducts,
    });
  } catch (err) {
    console.error("❌ Lỗi advanced-search:", err.message);
    res.status(500).json({ message: "Lỗi server khi lọc nâng cao." });
  }
});
// PATCH /api/products/:id/status  (Ẩn/Hiện sản phẩm)
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // true (hiện) hoặc false (ẩn)
    if (typeof status !== "boolean") {
      return res.status(400).json({ message: "Status phải là true hoặc false." });
    }
    const product = await Product.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });
    res.json({ message: status ? "Sản phẩm đã được hiện/bật bán." : "Sản phẩm đã được ẩn/ngừng bán.", product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
function mapCategoryToGroup(name) {
  name = name.toLowerCase();
  if (name.includes("áo sơ mi") || name.includes("áo thun") || name.includes("áo polo")) {
    return "tops";
  }
  if (name.includes("quần dài") || name.includes("quần đùi") || name.includes("quần")) {
    return "bottoms";
  }
  if (name.includes("áo khoác") || name.includes("jacket") || name.includes("blazer")) {
    return "outers";
  }
  if (name.includes("váy") || name.includes("dress")) {
    return "dress";
  }
  if (name.includes("phụ kiện") || name.includes("accessories")) {
    return "accessories";
  }
  return null;
}

router.get("/suggest-outfit/:productID", async (req, res) => {
  try {
    const { productID } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productID)) {
      return res.status(400).json({ message: "productID không hợp lệ." });
    }

    // lấy sản phẩm gốc + ảnh
    const baseProduct = await Product.findById(productID).populate("categoryID");
    if (!baseProduct) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });

    // lấy ảnh cho base
    const baseImages = await Image.findOne({ productID: baseProduct._id });

    const group = mapCategoryToGroup(baseProduct.categoryID.name);
    let suggestions = {};

    // rule cho từng group
    if (group === "tops") {
      const bottoms = await Product.find()
        .populate("categoryID")
        .where("categoryID").in(await getCategoryIdsByGroup("bottoms"));
      const outers = await Product.find()
        .populate("categoryID")
        .where("categoryID").in(await getCategoryIdsByGroup("outers"));

      suggestions = { 
        bottoms: await attachImages(randomPick(bottoms, 3)), 
        outers: await attachImages(randomPick(outers, 3)) 
      };
    }

    if (group === "bottoms") {
      const tops = await Product.find()
        .populate("categoryID")
        .where("categoryID").in(await getCategoryIdsByGroup("tops"));
      const outers = await Product.find()
        .populate("categoryID")
        .where("categoryID").in(await getCategoryIdsByGroup("outers"));

      suggestions = { 
        tops: await attachImages(randomPick(tops, 3)), 
        outers: await attachImages(randomPick(outers, 3)) 
      };
    }

    if (group === "dress") {
      const outers = await Product.find()
        .populate("categoryID")
        .where("categoryID").in(await getCategoryIdsByGroup("outers"));
      const accessories = await Product.find()
        .populate("categoryID")
        .where("categoryID").in(await getCategoryIdsByGroup("accessories"));

      suggestions = { 
        outers: await attachImages(randomPick(outers, 3)), 
        accessories: await attachImages(randomPick(accessories, 3)) 
      };
    }

    return res.json({ 
      base: { ...baseProduct.toObject(), images: baseImages?.imageURL || [] },
      suggestions 
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// helper: gắn ảnh vào product
async function attachImages(products) {
  const results = [];
  for (let p of products) {
    const imgs = await Image.findOne({ productID: p._id });
    results.push({
      ...p.toObject(),
      images: imgs?.imageURL || []
    });
  }
  return results;
}

async function getCategoryIdsByGroup(group) {
  const mapping = {
    tops: ["Áo Sơ Mi", "Áo Thun", "Áo Polo"],
    bottoms: ["Quần Dài", "Quần Đùi"],
    outers: ["Áo Khoác"],
    dress: ["Váy"],
    accessories: ["Phụ Kiện"]
  };
  const cats = await Category.find({ name: { $in: mapping[group] } });
  return cats.map(c => c._id);
}

// Helper: random pick N phần tử
function randomPick(arr, n) {
  if (!arr || arr.length === 0) return [];
  return arr.sort(() => 0.5 - Math.random()).slice(0, n);
}

module.exports = router;