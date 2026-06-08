const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const TableOrRoom = require('../models/TableOrRoom');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const QRScan = require('../models/QRScan');

// GET /api/customer/menu/:slug
router.get('/menu/:slug', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    if (!restaurant.isActive) {
      return res.status(403).json({ message: 'This restaurant is temporarily suspended' });
    }

    const categories = await Category.find({ 
      restaurantId: restaurant._id, 
      isHidden: false 
    }).sort({ order: 1 });

    const items = await MenuItem.find({ 
      restaurantId: restaurant._id,
      inStock: true // Customer can only see/order in-stock items
    }).sort({ order: 1 });

    const qrType = req.query.qrType || (req.query.room ? 'Room' : req.query.table ? 'Table' : 'DirectMenu');
    const targetName = req.query.table || req.query.room || qrType;
    const tableObj = targetName ? await TableOrRoom.findOne({ restaurantId: restaurant._id, name: targetName }) : null;
    await QRScan.create({
      restaurantId: restaurant._id,
      tableOrRoomId: tableObj?._id,
      qrType,
      targetName,
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip
    });

    res.json({
      restaurant,
      categories,
      items
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/customer/orders
router.post('/orders', async (req, res) => {
  const { slug, tableOrRoomName, tableOrRoomType, items, specialInstructions, customer = {}, source = 'customer_qr' } = req.body;
  try {
    // 1. Resolve Restaurant
    const restaurant = await Restaurant.findOne({ slug });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    if (!restaurant.isActive) {
      return res.status(403).json({ message: 'This restaurant is temporarily offline' });
    }

    // Check if Ordering system is enabled
    if (tableOrRoomType === 'Room' && !restaurant.features.roomOrdering) {
      return res.status(400).json({ message: 'Room ordering is disabled for this restaurant' });
    }
    if (tableOrRoomType !== 'Room' && !restaurant.features.tableOrdering) {
      return res.status(400).json({ message: 'Table ordering is disabled for this restaurant' });
    }
    if (!restaurant.features.selfCheckout) {
      return res.status(400).json({ message: 'Self-checkout ordering is disabled' });
    }

    // 2. Resolve or Create Table/Room
    let tableObj = await TableOrRoom.findOne({ 
      restaurantId: restaurant._id, 
      name: tableOrRoomName 
    });
    
    if (!tableObj) {
      // Dynamic fallback creation if table scanning is not strictly initialized
      tableObj = new TableOrRoom({
        restaurantId: restaurant._id,
        name: tableOrRoomName,
        type: tableOrRoomType || 'Table',
        isActive: true
      });
      await tableObj.save();
    }

    if (!tableObj.isActive) {
      return res.status(400).json({ message: 'This table or room code is inactive' });
    }

    // 3. Compile items & pricing server-side to prevent tampering
    let totalAmount = 0;
    const compiledItems = [];

    for (let item of items) {
      const dbItem = await MenuItem.findOne({ 
        _id: item.menuItemId, 
        restaurantId: restaurant._id 
      });
      
      if (!dbItem) {
        return res.status(400).json({ message: `Item with ID ${item.menuItemId} not found` });
      }
      if (!dbItem.inStock) {
        return res.status(400).json({ message: `Item "${dbItem.name}" is currently out of stock` });
      }

      let itemPrice = dbItem.price;
      
      if (item.variantName && dbItem.hasVariants && dbItem.variants && dbItem.variants.length > 0) {
        const variant = dbItem.variants.find(v => v.name === item.variantName);
        if (variant) {
          itemPrice = variant.price;
        } else {
          return res.status(400).json({ message: `Variant "${item.variantName}" not found for item "${dbItem.name}"` });
        }
      } else if (dbItem.hasVariants && dbItem.variants && dbItem.variants.length > 0) {
        itemPrice = dbItem.variants[0].price;
      }

      const itemCost = itemPrice * item.quantity;
      totalAmount += itemCost;

      compiledItems.push({
        menuItemId: dbItem._id,
        name: dbItem.name,
        price: itemPrice,
        quantity: item.quantity,
        variantName: item.variantName || '',
        specialInstructions: item.specialInstructions || ''
      });
    }

    // 4. Generate order number
    const count = await Order.countDocuments({ restaurantId: restaurant._id });
    const orderNumber = `ORD-${Date.now().toString().slice(-4)}-${count + 1}`;

    let customerRecord = null;
    if (restaurant.features.customerDataCollection && restaurant.customerDataSettings?.enabled) {
      const fields = restaurant.customerDataSettings.fields || {};
      for (const [fieldName, cfg] of Object.entries(fields)) {
        if (cfg.enabled && cfg.required && !customer[fieldName]) {
          return res.status(400).json({ message: `${fieldName} is required before placing an order` });
        }
      }

      const lookup = {
        restaurantId: restaurant._id,
        $or: [
          customer.mobile ? { mobile: customer.mobile } : null,
          customer.email ? { email: customer.email } : null
        ].filter(Boolean)
      };

      if (lookup.$or.length) {
        customerRecord = await Customer.findOne(lookup);
      }
      if (!customerRecord) {
        customerRecord = new Customer({ restaurantId: restaurant._id, firstVisitAt: new Date() });
      }

      ['name', 'mobile', 'email', 'dateOfBirth', 'anniversaryDate'].forEach((field) => {
        if (customer[field] !== undefined && customer[field] !== '') customerRecord[field] = customer[field];
      });
      customerRecord.visitCount += 1;
      customerRecord.totalSpend += totalAmount;
      customerRecord.lastVisitAt = new Date();
      await customerRecord.save();
    }

    // 5. Create Order
    const newOrder = new Order({
      restaurantId: restaurant._id,
      tableOrRoomId: tableObj._id,
      customerId: customerRecord?._id,
      tableName: tableObj.name,
      items: compiledItems,
      totalAmount,
      status: 'New',
      orderNumber,
      source,
      statusTimeline: [{ status: 'New', timestamp: new Date() }],
      specialInstructions: specialInstructions || ''
    });

    const savedOrder = await newOrder.save();

    // 6. Push real-time Socket.IO notifications
    const io = req.app.get('io');
    if (io) {
      const restRoom = restaurant._id.toString();
      // Notify restaurant admin dashboard & kitchen panel
      io.to(restRoom).emit('orderCreated', savedOrder);
      io.to(`${restRoom}_kitchen`).emit('orderCreated', savedOrder);
    }

    res.status(201).json(savedOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/customer/orders/batch
router.get('/orders/batch', async (req, res) => {
  const { ids } = req.query;
  try {
    if (!ids) {
      return res.json([]);
    }
    const orderIds = ids.split(',').filter(Boolean);
    const orders = await Order.find({ _id: { $in: orderIds } }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/customer/orders/:orderId
router.get('/orders/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Resolve branding info for tracking page
    const restaurant = await Restaurant.findById(order.restaurantId, 'name brandColor logo brandingSettings');

    res.json({
      order,
      restaurant
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/customer/call-waiter
const WaiterCall = require('../models/WaiterCall');
router.post('/call-waiter', async (req, res) => {
  const { slug, tableOrRoomName } = req.body;
  try {
    const restaurant = await Restaurant.findOne({ slug });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    let tableObj = await TableOrRoom.findOne({
      restaurantId: restaurant._id,
      name: tableOrRoomName
    });

    if (!tableObj) {
      // Fallback
      tableObj = new TableOrRoom({
        restaurantId: restaurant._id,
        name: tableOrRoomName,
        type: 'Table',
        isActive: true
      });
      await tableObj.save();
    }

    const waiterCall = new WaiterCall({
      restaurantId: restaurant._id,
      tableOrRoomId: tableObj._id,
      tableLabel: tableObj.name,
      calledAt: new Date(),
      isAttended: false
    });

    await waiterCall.save();

    // Socket alert
    const io = req.app.get('io');
    if (io) {
      const restRoom = restaurant._id.toString();
      io.to(restRoom).emit('waiterCalled', waiterCall);
      io.to(`${restRoom}_kitchen`).emit('waiterCalled', waiterCall);
    }

    res.status(201).json(waiterCall);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
