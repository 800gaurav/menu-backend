const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes here
router.use(authenticate, authorize(['restaurantadmin', 'kitchen', 'counter', 'waiter']));

// GET /api/orders
router.get('/', async (req, res) => {
  const { status, table, limit, live, history, page, pagination, startDate, endDate, search } = req.query;
  try {
    const restId = mongoose.Types.ObjectId.isValid(req.user.restaurantId)
      ? new mongoose.Types.ObjectId(req.user.restaurantId)
      : req.user.restaurantId;
    const query = { restaurantId: restId };
    const andConditions = [];
    
    if (history === 'true') {
      if (status === 'Completed') {
        andConditions.push({ $or: [{ status: 'Completed' }, { paymentStatus: 'Paid' }] });
      } else if (status === 'Cancelled') {
        andConditions.push({ status: 'Cancelled' });
      } else {
        andConditions.push({
          $or: [
            { status: 'Completed' },
            { paymentStatus: 'Paid' },
            { status: 'Cancelled' }
          ]
        });
      }
    } else if (status && status !== 'all') {
      if (status.includes(',')) {
        query.status = { $in: status.split(',').map(s => s.trim()) };
      } else {
        query.status = status;
      }
    }

    if (table && table !== 'all') {
      query.tableName = new RegExp(table.trim(), 'i');
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (live === 'true') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      andConditions.push({
        $or: [
          { status: { $in: ['New', 'Accepted', 'Preparing', 'Ready', 'Served'] } },
          { status: { $in: ['Completed', 'Cancelled'] }, createdAt: { $gte: todayStart } }
        ]
      });
    }

    if (search && search.trim()) {
      const s = search.trim();
      const escaped = s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');

      const matchingCustomers = await Customer.find({
        restaurantId: req.user.restaurantId,
        $or: [{ name: searchRegex }, { mobile: searchRegex }]
      }).select('_id').lean();
      const customerIds = matchingCustomers.map(c => c._id);

      const searchOr = [
        { orderNumber: searchRegex },
        { tableName: searchRegex }
      ];
      if (customerIds.length > 0) {
        searchOr.push({ customerId: { $in: customerIds } });
      }

      andConditions.push({ $or: searchOr });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    if (pagination === 'true') {
      const p = Math.max(1, parseInt(page) || 1);
      const l = Math.max(1, parseInt(limit) || 15);
      const skip = (p - 1) * l;
      
      const revenueMatch = { ...query };
      if (status !== 'Cancelled') {
        if (revenueMatch.status) {
          if (typeof revenueMatch.status === 'object') {
            revenueMatch.status = { ...revenueMatch.status, $ne: 'Cancelled' };
          }
        } else {
          revenueMatch.status = { $ne: 'Cancelled' };
        }
      }

      const [totalCount, orders, revenueAgg] = await Promise.all([
        Order.countDocuments(query),
        Order.find(query)
          .populate('customerId')
          .populate('waiterId')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(l),
        Order.aggregate([
          { $match: revenueMatch },
          { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
        ])
      ]);

      const totalRevenue = revenueAgg && revenueAgg.length > 0 ? (revenueAgg[0].totalRevenue || 0) : 0;
      
      return res.json({
        orders,
        totalCount,
        totalPages: Math.ceil(totalCount / l) || 1,
        currentPage: p,
        totalRevenue: Math.round(totalRevenue)
      });
    }

    let ordersQuery = Order.find(query).populate('customerId').populate('waiterId').sort({ createdAt: -1 });

    if (limit) {
      ordersQuery = ordersQuery.limit(parseInt(limit));
    }
    
    const orders = await ordersQuery;
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/orders/history/export
router.get('/export', async (req, res) => {
  const { status, table, startDate, endDate, search, history } = req.query;
  try {
    const query = { restaurantId: req.user.restaurantId };
    const andConditions = [];

    if (history === 'true') {
      if (status === 'Completed') {
        andConditions.push({ $or: [{ status: 'Completed' }, { paymentStatus: 'Paid' }] });
      } else if (status === 'Cancelled') {
        andConditions.push({ status: 'Cancelled' });
      } else {
        andConditions.push({
          $or: [
            { status: 'Completed' },
            { paymentStatus: 'Paid' },
            { status: 'Cancelled' }
          ]
        });
      }
    } else if (status && status !== 'all') {
      if (status.includes(',')) {
        query.status = { $in: status.split(',').map(s => s.trim()) };
      } else {
        query.status = status;
      }
    }

    if (table && table !== 'all') {
      query.tableName = new RegExp(table.trim(), 'i');
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search && search.trim()) {
      const s = search.trim();
      const escaped = s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');

      const matchingCustomers = await Customer.find({
        restaurantId: req.user.restaurantId,
        $or: [{ name: searchRegex }, { mobile: searchRegex }]
      }).select('_id').lean();
      const customerIds = matchingCustomers.map(c => c._id);

      const searchOr = [
        { orderNumber: searchRegex },
        { tableName: searchRegex }
      ];
      if (customerIds.length > 0) {
        searchOr.push({ customerId: { $in: customerIds } });
      }
      andConditions.push({ $or: searchOr });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).lean();

    // Format as CSV
    let csv = 'Order Number,Table/Room,Total Amount,Status,Date,Items\n';
    
    for (let o of orders) {
      const itemsString = (o.items || []).map(i => `${i.name} (x${i.quantity})`).join('; ');
      const dateStr = o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : '';
      csv += `"${o.orderNumber || ''}","${o.tableName || ''}",${o.totalAmount || 0},"${o.status || ''}","${dateStr}","${itemsString}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders_history.csv');
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId }).populate('customerId').populate('waiterId');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status, servedBy } = req.body;
  try {
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const allowedStatuses = ['New', 'Accepted', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    order.status = status;
    if (status === 'Completed') {
      order.paymentStatus = 'Paid';
      if (order.customerId) {
        const Customer = require('../models/Customer');
        await Customer.findByIdAndUpdate(order.customerId, {
          $inc: { totalSpend: order.totalAmount },
          $set: { lastVisitAt: order.completedAt || new Date() }
        });
      }
    }
    if (servedBy) {
      order.servedBy = servedBy;
    }
    const timestampField = {
      Accepted: 'acceptedAt',
      Preparing: 'preparingAt',
      Ready: 'readyAt',
      Served: 'servedAt',
      Completed: 'completedAt'
    }[status];
    if (timestampField && !order[timestampField]) order[timestampField] = new Date();
    order.statusTimeline.push({ status, timestamp: new Date() });
    await order.save();

    // Trigger Socket.IO updates
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      // Emit to restaurant dashboard and kitchen room
      io.to(restRoom).emit('orderUpdated', order);
      io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
      io.to(restRoom).emit('order-updated', order);
      io.to(`${restRoom}_kitchen`).emit('order-updated', order);
      // Emit to specific customer order room
      io.to(order._id.toString()).emit('orderStatusChanged', order);
    }

    // Trigger FCM Push Notifications
    const { notifyRestaurantRoles, notifySpecificUser } = require('../utils/firebase');
    
    // 1. Notify Waiters if order is Ready to Serve
    if (status === 'Ready') {
      notifyRestaurantRoles(
        order.restaurantId,
        'waiter',
        'Food is Ready!',
        `Order ${order.orderNumber} for Table ${order.tableName} is ready to serve.`,
        { orderId: order._id.toString(), type: 'order_ready' }
      ).catch(err => console.error('Error triggering ready status FCM:', err));
    }

    // 2. Notify Customer if order status changed
    if (order.customerId) {
      const statusMsgs = {
        Accepted: `Your order ${order.orderNumber} has been accepted by the kitchen.`,
        Preparing: `The chef is now preparing your food for Table ${order.tableName}.`,
        Ready: `Your delicious food is ready and will be served shortly!`,
        Served: `Enjoy your meal! Food has been served at your table.`
      };
      const bodyText = statusMsgs[status];
      if (bodyText) {
        notifySpecificUser(
          order.restaurantId,
          order.customerId,
          'Order Status Update',
          bodyText,
          { orderId: order._id.toString(), type: 'customer_order_status' }
        ).catch(err => console.error('Error triggering customer status FCM:', err));
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/orders/:id (Update items, totals, discount adjustments)
router.put('/:id', async (req, res) => {
  const { items, subtotal, taxAmount, totalAmount } = req.body;
  try {
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    if (items) order.items = items;
    if (subtotal !== undefined) order.subtotal = subtotal;
    if (taxAmount !== undefined) order.taxAmount = taxAmount;
    if (totalAmount !== undefined) order.totalAmount = totalAmount;
    
    await order.save();
    
    if (order.status === 'Served') {
      const otherOrders = await Order.find({
        restaurantId: req.user.restaurantId,
        tableName: order.tableName,
        status: 'Served',
        _id: { $ne: order._id }
      });
      for (const other of otherOrders) {
        other.items = [];
        other.subtotal = 0;
        other.taxAmount = 0;
        other.totalAmount = 0;
        await other.save();
      }
    }
    
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      io.to(restRoom).emit('orderUpdated', order);
      io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
      io.to(restRoom).emit('order-updated', order);
      io.to(`${restRoom}_kitchen`).emit('order-updated', order);
      io.to(order._id.toString()).emit('orderStatusChanged', order);
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/orders/:id/priority
router.patch('/:id/priority', async (req, res) => {
  const { priority } = req.body;
  try {
    if (!['Normal', 'High', 'Rush'].includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority' });
    }
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.priority = priority;
    await order.save();
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      io.to(restRoom).emit('orderUpdated', order);
      io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
      io.to(restRoom).emit('order-updated', order);
      io.to(`${restRoom}_kitchen`).emit('order-updated', order);
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/orders/:id/bill-request
router.patch('/:id/bill-request', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.billRequested = true;
    await order.save();

    // Trigger Socket.IO updates
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      io.to(restRoom).emit('orderUpdated', order);
      io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
      io.to(restRoom).emit('order-updated', order);
      io.to(`${restRoom}_kitchen`).emit('order-updated', order);
    }

    // Trigger FCM Push Notifications
    const { notifyRestaurantRoles } = require('../utils/firebase');
    notifyRestaurantRoles(
      order.restaurantId,
      ['restaurantadmin', 'counter'],
      'Bill Requested!',
      `Table ${order.tableName} has requested their bill for ₹${order.totalAmount}.`,
      { orderId: order._id.toString(), type: 'bill_request' }
    ).catch(err => console.error('Error bill request FCM:', err));

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/orders/:id/payment
router.patch('/:id/payment', async (req, res) => {
  const { paymentStatus } = req.body;
  try {
    if (!['Unpaid', 'Paid'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }
    const mainOrder = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!mainOrder) return res.status(404).json({ message: 'Order not found' });

    const tableOrders = await Order.find({
      restaurantId: req.user.restaurantId,
      tableName: mainOrder.tableName,
      status: 'Served'
    });

    const allOrdersToUpdate = [mainOrder, ...tableOrders.filter(o => o._id.toString() !== mainOrder._id.toString())];

    const io = req.app.get('io');
    const restRoom = req.user.restaurantId.toString();

    for (const order of allOrdersToUpdate) {
      order.paymentStatus = paymentStatus;
      await order.save();

      if (io) {
        io.to(restRoom).emit('orderUpdated', order);
        io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
        io.to(order._id.toString()).emit('orderStatusChanged', order);
      }
    }
    
    res.json(mainOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', authorize(['restaurantadmin']), async (req, res) => {
  try {
    const order = await Order.findOneAndDelete({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      io.to(restRoom).emit('orderDeleted', req.params.id);
      io.to(`${restRoom}_kitchen`).emit('orderDeleted', req.params.id);
    }
    
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
