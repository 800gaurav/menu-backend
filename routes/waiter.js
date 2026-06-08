const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const TableOrRoom = require('../models/TableOrRoom');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const WaiterCall = require('../models/WaiterCall');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes
router.use(authenticate, authorize(['restaurantadmin', 'waiter']));

// GET /api/waiter/tables - Get seating layout with Occupied/Free status and active order details
router.get('/tables', async (req, res) => {
  try {
    const tables = await TableOrRoom.find({ restaurantId: req.user.restaurantId, isActive: true });
    const tableStatusList = [];

    for (let table of tables) {
      // Find if there is an active order for this table
      const activeOrder = await Order.findOne({
        restaurantId: req.user.restaurantId,
        tableOrRoomId: table._id,
        status: { $in: ['New', 'Accepted', 'Preparing', 'Ready', 'Served'] }
      }).sort({ createdAt: -1 });

      tableStatusList.push({
        _id: table._id,
        name: table.name,
        type: table.type,
        printLabel: table.printLabel,
        targetUrl: table.targetUrl,
        qrCodeData: table.qrCodeData,
        status: activeOrder ? 'Occupied' : 'Free',
        activeOrderId: activeOrder ? activeOrder._id : null,
        activeOrderAmount: activeOrder ? activeOrder.totalAmount : 0
      });
    }

    res.json(tableStatusList);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/waiter/orders - Place a manual order by waiter
router.post('/orders', async (req, res) => {
  const { tableOrRoomId, items, specialInstructions } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const table = await TableOrRoom.findOne({ _id: tableOrRoomId, restaurantId: restaurant._id });
    if (!table) {
      return res.status(404).json({ message: 'Table or Room not found' });
    }

    let subtotal = 0;
    const compiledItems = [];

    for (let item of items) {
      const dbItem = await MenuItem.findOne({ _id: item.menuItemId, restaurantId: restaurant._id });
      if (!dbItem) {
        return res.status(400).json({ message: `Menu item with ID ${item.menuItemId} not found` });
      }
      if (!dbItem.inStock) {
        return res.status(400).json({ message: `Item "${dbItem.name}" is out of stock` });
      }

      const itemCost = dbItem.price * item.quantity;
      subtotal += itemCost;

      compiledItems.push({
        menuItemId: dbItem._id,
        name: dbItem.name,
        price: dbItem.price,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || ''
      });
    }

    const taxRate = 0.05; // 5% standard restaurant tax / GST
    const taxAmount = Math.round(subtotal * taxRate);
    const totalAmount = subtotal + taxAmount;

    const count = await Order.countDocuments({ restaurantId: restaurant._id });
    const orderNumber = `ORD-WTR-${Date.now().toString().slice(-4)}-${count + 1}`;

    const newOrder = new Order({
      restaurantId: restaurant._id,
      tableOrRoomId: table._id,
      tableName: table.name,
      items: compiledItems,
      placedBy: 'waiter',
      waiterId: req.user.id,
      subtotal,
      taxAmount,
      totalAmount,
      status: 'New',
      orderNumber,
      source: table.type === 'Room' ? 'reception' : 'customer_qr',
      statusTimeline: [{ status: 'New', timestamp: new Date() }],
      specialInstructions: specialInstructions || ''
    });

    const savedOrder = await newOrder.save();

    // Notify KDS / Restaurant Admin via sockets
    const io = req.app.get('io');
    if (io) {
      const restRoom = restaurant._id.toString();
      io.to(restRoom).emit('orderCreated', savedOrder);
      io.to(`${restRoom}_kitchen`).emit('orderCreated', savedOrder);
    }

    res.status(201).json(savedOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/waiter/calls - Get all active pager calls for this restaurant
router.get('/calls', async (req, res) => {
  try {
    const calls = await WaiterCall.find({
      restaurantId: req.user.restaurantId,
      isAttended: false
    }).sort({ calledAt: -1 });
    res.json(calls);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/waiter/calls/:id/attend - Mark a call as attended
router.patch('/calls/:id/attend', async (req, res) => {
  try {
    const call = await WaiterCall.findOne({
      _id: req.params.id,
      restaurantId: req.user.restaurantId
    });

    if (!call) {
      return res.status(404).json({ message: 'Call notification not found' });
    }

    call.isAttended = true;
    call.attendedAt = new Date();
    await call.save();

    // Notify others via socket
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      io.to(restRoom).emit('waiterCallAttended', call);
      io.to(`${restRoom}_kitchen`).emit('waiterCallAttended', call);
    }

    res.json(call);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
