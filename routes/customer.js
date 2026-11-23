const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const Restaurant = require('../models/Restaurant');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const TableOrRoom = require('../models/TableOrRoom');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const QRScan = require('../models/QRScan');
const SharedCart = require('../models/SharedCart');

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

    const activeTables = await TableOrRoom.find({ 
      restaurantId: restaurant._id, 
      isActive: true 
    }).select('name type').sort({ name: 1 });

    res.json({
      restaurant,
      categories,
      items,
      tables: activeTables
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/customer/auth
router.post('/auth', async (req, res) => {
  const { name, mobile, slug } = req.body;
  try {
    const restaurant = await Restaurant.findOne({ slug });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    let customerRecord = await Customer.findOne({ restaurantId: restaurant._id, mobile });
    if (!customerRecord) {
      customerRecord = new Customer({
        restaurantId: restaurant._id,
        name: name || 'Guest Customer',
        mobile,
        firstVisitAt: new Date()
      });
    } else {
      if (name) customerRecord.name = name;
    }
    customerRecord.lastVisitAt = new Date();
    await customerRecord.save();

    const token = jwt.sign(
      { id: customerRecord._id, name: customerRecord.name, mobile: customerRecord.mobile, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, customer: customerRecord });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/customer/orders
router.post('/orders', async (req, res) => {
  const { slug, tableOrRoomName, tableOrRoomType, items, specialInstructions, customer = {}, source = 'customer_qr', cartSessionId } = req.body;
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

      // Add topping / addons pricing
      let addonsPrice = 0;
      const compiledAddons = [];
      if (item.addons && item.addons.length > 0 && dbItem.addons) {
        for (let add of item.addons) {
          const dbAddon = dbItem.addons.find(a => a.name === add.name);
          if (dbAddon) {
            addonsPrice += dbAddon.price;
            compiledAddons.push({ name: dbAddon.name, price: dbAddon.price });
          }
        }
      }

      const itemCost = (itemPrice + addonsPrice) * item.quantity;
      totalAmount += itemCost;

      compiledItems.push({
        menuItemId: dbItem._id,
        name: dbItem.name,
        price: itemPrice + addonsPrice,
        quantity: item.quantity,
        variantName: item.variantName || '',
        addons: compiledAddons,
        specialInstructions: item.specialInstructions || ''
      });
    }

    // 4. Generate order number
    const count = await Order.countDocuments({ restaurantId: restaurant._id });
    const orderNumber = `ORD-${Date.now().toString().slice(-4)}-${count + 1}`;

    // 5. Try identifying customer from JWT auth header
    let customerRecord = null;
    let authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (decoded && decoded.role === 'customer') {
          customerRecord = await Customer.findOne({ _id: decoded.id, restaurantId: restaurant._id });
        }
      } catch (err) {
        console.error("JWT verification failed for customer placement:", err);
      }
    }

    // Fallback: Resolve/Create customer from provided form body
    if (!customerRecord && (customer.mobile || customer.name)) {
      const mobile = customer.mobile;
      if (mobile) {
        customerRecord = await Customer.findOne({ restaurantId: restaurant._id, mobile });
        if (!customerRecord) {
          customerRecord = new Customer({
            restaurantId: restaurant._id,
            name: customer.name || 'Guest Customer',
            mobile,
            firstVisitAt: new Date()
          });
        } else {
          if (customer.name) customerRecord.name = customer.name;
        }
        
        ['email', 'dateOfBirth', 'anniversaryDate'].forEach((field) => {
          if (customer[field] !== undefined && customer[field] !== '') customerRecord[field] = customer[field];
        });
        customerRecord.visitCount += 1;
        // totalSpend will be updated once the order is fully settled/completed
        customerRecord.lastVisitAt = new Date();
        await customerRecord.save();
      }
    }

    // 6. Create Order
    const newOrder = new Order({
      restaurantId: restaurant._id,
      tableOrRoomId: tableObj._id,
      customerId: customerRecord?._id,
      customerName: customerRecord?.name || customer?.name || '',
      customerMobile: customerRecord?.mobile || customer?.mobile || '',
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
    await savedOrder.populate('customerId');

    // 7. Push real-time Socket.IO & FCM notifications
    const io = req.app.get('io');
    if (io) {
      const restRoom = restaurant._id.toString();
      // Always notify restaurant admin dashboard
      io.to(restRoom).emit('orderCreated', savedOrder);
      io.to(restRoom).emit('new-order', savedOrder);

      // Only notify kitchen panel if kitchenPanel is enabled in plan
      if (restaurant.features?.kitchenPanel !== false) {
        io.to(`${restRoom}_kitchen`).emit('orderCreated', savedOrder);
        io.to(`${restRoom}_kitchen`).emit('new-order', savedOrder);
      }

      // Only notify waiter panel if waiterPanel is enabled in plan
      if (restaurant.features?.waiterPanel !== false) {
        io.to(`${restRoom}_waiter`).emit('orderCreated', savedOrder);
        io.to(`${restRoom}_waiter`).emit('new-order', savedOrder);
      }

      // If placed from a Shared Cart (Group Order), notify members & update cart session
      if (cartSessionId) {
        io.to(`cart_${cartSessionId}`).emit('groupOrderPlaced', {
          orderId: savedOrder._id,
          orderNumber: savedOrder.orderNumber,
          tableName: savedOrder.tableName,
          placedBy: customerRecord?.name || 'Host'
        });
      }
    }

    if (cartSessionId) {
      try {
        const sharedCart = await SharedCart.findOne({ cartSessionId });
        if (sharedCart) {
          sharedCart.status = 'ordered';
          sharedCart.orderId = savedOrder._id;
          sharedCart.items = [];
          await sharedCart.save();
        }
      } catch (scErr) {
        console.error('Error updating SharedCart on order placement:', scErr);
      }
    }

    // Trigger FCM Push Notifications
    const { notifyRestaurantRoles } = require('../utils/firebase');
    const notifyRoles = ['restaurantadmin', 'counter'];
    if (restaurant.features?.kitchenPanel !== false) {
      notifyRoles.push('kitchen');
    }
    if (restaurant.features?.waiterPanel !== false) {
      notifyRoles.push('waiter');
    }
    notifyRestaurantRoles(
      restaurant._id,
      notifyRoles,
      `New order - ${restaurant.name || 'Restaurant'}`,
      `Table ${tableObj.name} | Order ${savedOrder.orderNumber} | ${savedOrder.items.reduce((count, item) => count + (Number(item.quantity) || 0), 0)} items | INR ${savedOrder.totalAmount}`,
      { orderId: savedOrder._id.toString(), type: 'new_order' }
    ).catch(err => console.error('Error triggering new order FCM:', err));

    // 8. Generate new token if not logged in
    let customerToken = null;
    if (customerRecord) {
      customerToken = jwt.sign(
        { id: customerRecord._id, name: customerRecord.name, mobile: customerRecord.mobile, role: 'customer' },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
    }

    res.status(201).json({
      order: savedOrder,
      customerToken,
      customer: customerRecord ? {
        id: customerRecord._id,
        name: customerRecord.name,
        mobile: customerRecord.mobile
      } : null
    });
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
    if (restaurant.features && restaurant.features.waiterPanel === false) {
      return res.status(403).json({ message: 'Waiter call service is not enabled in this restaurant subscription plan.' });
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

    const publishWaiterCall = (call) => {
      const alertId = call._id.toString();
      const io = req.app.get('io');
      if (io) {
        const restRoom = restaurant._id.toString();
        // Emit to admin dashboard
        io.to(restRoom).emit('waiterCalled', {
          ...call.toObject(),
          alertId
        });
        // Emit to waiter room if enabled
        if (restaurant.features?.waiterPanel !== false) {
          io.to(`${restRoom}_waiter`).emit('waiterCalled', {
            ...call.toObject(),
            alertId
          });
        }
      }

      if (restaurant.features?.waiterPanel !== false) {
        const { notifyRestaurantRoles } = require('../utils/firebase');
        notifyRestaurantRoles(
          restaurant._id,
          'waiter',
          `Service requested - ${restaurant.name || 'Restaurant'}`,
          `Table ${tableObj.name} is waiting for a waiter.`,
          { callId: call._id.toString(), alertId, type: 'waiter_call' }
        ).catch(err => console.error('Error waiter call FCM:', err));
      }
    };

    // Repeated taps/retries for the same table should reuse the outstanding
    // request until a waiter attends it instead of creating another alert.
    const existingCall = await WaiterCall.findOne({
      restaurantId: restaurant._id,
      tableOrRoomId: tableObj._id,
      isAttended: false
    }).sort({ calledAt: -1 });
    if (existingCall) {
      return res.json(existingCall);
    }

    const waiterCall = new WaiterCall({
      restaurantId: restaurant._id,
      tableOrRoomId: tableObj._id,
      tableLabel: tableObj.name,
      activeCallKey: `${restaurant._id}:${tableObj._id}`,
      calledAt: new Date(),
      isAttended: false
    });

    try {
      await waiterCall.save();
    } catch (error) {
      // The sparse unique key closes the race where two calls arrive together.
      if (error.code === 11000) {
        const activeCall = await WaiterCall.findOne({
          restaurantId: restaurant._id,
          tableOrRoomId: tableObj._id,
          isAttended: false
        }).sort({ calledAt: -1 });
        if (activeCall) {
          return res.json(activeCall);
        }
      }
      throw error;
    }

    publishWaiterCall(waiterCall);

    res.status(201).json(waiterCall);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==========================================
// SHARED / GROUP CART (Host & Partner Dining)
// ==========================================

// POST /api/customer/cart/session
// Create or initialize a shared cart session
router.post('/cart/session', async (req, res) => {
  try {
    const { restaurantSlug, tableName, tableType, hostId, hostName } = req.body;
    if (!restaurantSlug || !tableName) {
      return res.status(400).json({ message: 'restaurantSlug and tableName are required' });
    }

    const cartSessionId = `cart_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newCart = new SharedCart({
      cartSessionId,
      restaurantSlug,
      tableName,
      tableType: tableType || 'Table',
      hostId: hostId || `host_${Date.now()}`,
      hostName: hostName || 'Host',
      items: []
    });
    await newCart.save();

    res.status(201).json(newCart);
  } catch (err) {
    console.error('Error creating shared cart session:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/customer/cart/:cartSessionId
// Fetch current shared cart
router.get('/cart/:cartSessionId', async (req, res) => {
  try {
    const cart = await SharedCart.findOne({ cartSessionId: req.params.cartSessionId });
    if (!cart) {
      return res.status(404).json({ message: 'Shared cart session not found or expired' });
    }
    res.json(cart);
  } catch (err) {
    console.error('Error fetching shared cart:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/customer/cart/:cartSessionId/sync
// Sync items (add, update, remove) from host or partner
router.post('/cart/:cartSessionId/sync', async (req, res) => {
  try {
    const { items, specialInstructions, senderId, senderName } = req.body;
    const cart = await SharedCart.findOne({ cartSessionId: req.params.cartSessionId });
    if (!cart) {
      return res.status(404).json({ message: 'Shared cart session not found' });
    }

    if (Array.isArray(items)) {
      cart.items = items;
    }
    if (specialInstructions !== undefined) {
      cart.specialInstructions = specialInstructions;
    }
    cart.updatedAt = new Date();
    await cart.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`cart_${cart.cartSessionId}`).emit('cartUpdated', {
        cartSessionId: cart.cartSessionId,
        items: cart.items,
        specialInstructions: cart.specialInstructions,
        senderId,
        senderName: senderName || 'A dining partner'
      });
    }

    res.json({ success: true, cart });
  } catch (err) {
    console.error('Error syncing shared cart:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
