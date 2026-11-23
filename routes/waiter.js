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

// Validate plan permissions for waiter panel
router.use(async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant || !restaurant.isActive) {
      return res.status(403).json({ message: 'Restaurant account is not active.' });
    }
    if (restaurant.features && restaurant.features.waiterPanel === false) {
      return res.status(403).json({ message: 'Waiter Panel is not included in this restaurant subscription plan.' });
    }
    req.restaurant = restaurant;
    next();
  } catch (err) {
    next(err);
  }
});

// GET /api/waiter/tables - Get seating layout with Occupied/Free status and active order details
router.get('/tables', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const restId = mongoose.Types.ObjectId.isValid(req.user.restaurantId)
      ? new mongoose.Types.ObjectId(req.user.restaurantId)
      : req.user.restaurantId;
    const tables = await TableOrRoom.find({ 
      restaurantId: { $in: [restId, String(restId)] }, 
      isActive: true 
    });
    const tableStatusList = [];

    for (let table of tables) {
      // Find if there is an active order for this table by ID or by tableName
      const activeOrder = await Order.findOne({
        restaurantId: { $in: [restId, String(restId)] },
        $or: [
          { tableOrRoomId: table._id },
          { tableName: table.name }
        ],
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
        activeOrderStatus: activeOrder ? activeOrder.status : null,
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

      let itemPrice = dbItem.price;
      if (item.variantName && dbItem.hasVariants && dbItem.variants && dbItem.variants.length > 0) {
        const foundVariant = dbItem.variants.find(v => v.name === item.variantName);
        if (foundVariant) {
          itemPrice = foundVariant.price;
        }
      } else if (dbItem.hasVariants && dbItem.variants && dbItem.variants.length > 0) {
        itemPrice = dbItem.variants[0].price;
      }

      const itemCost = itemPrice * item.quantity;
      subtotal += itemCost;

      compiledItems.push({
        menuItemId: dbItem._id,
        name: dbItem.name,
        variantName: item.variantName || '',
        price: itemPrice,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || ''
      });
    }

    const taxAmount = 0;
    const totalAmount = subtotal;

    const count = await Order.countDocuments({ restaurantId: restaurant._id });
    const orderNumber = `ORD-WTR-${Date.now().toString().slice(-4)}-${count + 1}`;

    const newOrder = new Order({
      restaurantId: restaurant._id,
      tableOrRoomId: table._id,
      tableName: table.name,
      items: compiledItems,
      placedBy: 'waiter',
      waiterId: req.user.id,
      customerName: req.user.waiterName || req.user.name || 'Staff Waiter',
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
    await savedOrder.populate('waiterId');

    // Notify KDS / Restaurant Admin via sockets
    const io = req.app.get('io');
    if (io) {
      const restRoom = restaurant._id.toString();
      io.to(restRoom).emit('orderCreated', savedOrder);
      io.to(restRoom).emit('new-order', savedOrder);
      if (restaurant.features?.kitchenPanel !== false) {
        io.to(`${restRoom}_kitchen`).emit('orderCreated', savedOrder);
        io.to(`${restRoom}_kitchen`).emit('new-order', savedOrder);
      }
      if (restaurant.features?.waiterPanel !== false) {
        io.to(`${restRoom}_waiter`).emit('orderCreated', savedOrder);
        io.to(`${restRoom}_waiter`).emit('new-order', savedOrder);
      }
    }

    // Trigger FCM Push Notifications
    const { notifyRestaurantRoles } = require('../utils/firebase');
    const notifyRoles = ['restaurantadmin'];
    if (restaurant.features?.kitchenPanel !== false) notifyRoles.push('kitchen');
    notifyRestaurantRoles(
      restaurant._id,
      notifyRoles,
      `New order - ${restaurant.name || 'Restaurant'}`,
      `Table ${table.name} | Order ${savedOrder.orderNumber} | ${savedOrder.items.reduce((count, item) => count + (Number(item.quantity) || 0), 0)} items | INR ${savedOrder.totalAmount}`,
      { orderId: savedOrder._id.toString(), type: 'new_order_waiter' }
    ).catch(err => console.error('Error waiter order FCM:', err));

    res.status(201).json(savedOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/waiter/calls - Get all active pager calls for this restaurant
router.get('/calls', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const restId = mongoose.Types.ObjectId.isValid(req.user.restaurantId)
      ? new mongoose.Types.ObjectId(req.user.restaurantId)
      : req.user.restaurantId;
    const calls = await WaiterCall.find({
      restaurantId: { $in: [restId, String(restId)] },
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
    const mongoose = require('mongoose');
    const restId = mongoose.Types.ObjectId.isValid(req.user.restaurantId)
      ? new mongoose.Types.ObjectId(req.user.restaurantId)
      : req.user.restaurantId;
    const call = await WaiterCall.findOne({
      _id: req.params.id,
      restaurantId: { $in: [restId, String(restId)] }
    });

    if (!call) {
      return res.status(404).json({ message: 'Call notification not found' });
    }

    call.isAttended = true;
    call.attendedAt = new Date();
    call.activeCallKey = undefined;
    await call.save();

    // Notify others via socket
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      io.to(restRoom).emit('waiterCallAttended', call);
      io.to(`${restRoom}_waiter`).emit('waiterCallAttended', call);
      if (req.restaurant?.features?.kitchenPanel !== false) {
        io.to(`${restRoom}_kitchen`).emit('waiterCallAttended', call);
      }
    }

    res.json(call);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
