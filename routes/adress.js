const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Address = require("../models/Address");

// GET /api/addresses?userID=xxx (lấy địa chỉ theo user)
router.get("/", async (req, res) => {
  try {
    const { userID } = req.query;

    let filter = {};
    if (userID && mongoose.Types.ObjectId.isValid(userID)) {
      filter.userID = userID;
    }

    const addresses = await Address.find(filter);
    res.json(addresses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST addresses (thêm địa chỉ)
router.post("/", async (req, res) => {
  try {
    const { userID, address, name, sdt, isDefault } = req.body;

    if (!userID || !address || !name || !sdt) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc." });
    }

    // Nếu thêm mới địa chỉ mặc định, update lại các địa chỉ khác của user
    if (isDefault) {
      await Address.updateMany({ userID }, { isDefault: false });
    }

    const newAddress = new Address({
      userID,
      address,
      name,
      sdt,
      isDefault: !!isDefault,
    });

    await newAddress.save();
    res.status(201).json(newAddress);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/addresses/:id (sửa địa chỉ)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { address, name, sdt, isDefault } = req.body;

    const addressItem = await Address.findById(id);
    if (!addressItem) {
      return res.status(404).json({ message: "Không tìm thấy địa chỉ." });
    }

    if (address) addressItem.address = address;
    if (name) addressItem.name = name;
    if (sdt) addressItem.sdt = sdt;

    // Nếu cập nhật thành địa chỉ mặc định
    if (isDefault) {
      await Address.updateMany(
        { userID: addressItem.userID },
        { isDefault: false }
      );
      addressItem.isDefault = true;
    }

    await addressItem.save();
    res.json(addressItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/addresses/:id (xóa địa chỉ)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Address.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy địa chỉ." });
    }

    res.json({ message: "Xóa địa chỉ thành công." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
