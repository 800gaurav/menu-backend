const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes here
router.use(authenticate, authorize('restaurantadmin'));

// GET /api/orders
router.get('/', async (req, res) => {
  const { status, table, limit } = req.query;
  try {
    const query = { restaurantId: req.user.restaurantId };
    
    if (status) {
      query.status = status;
    }
    if (table) {
      query.tableName = new RegExp(table, 'i');
    }

    let ordersQuery = Order.find(query).sort({ createdAt: -1 });
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
  try {
    const orders = await Order.find({ 
      restaurantId: req.user.restaurantId 
    }).sort({ createdAt: -1 });

    // Format as CSV
    let csv = 'Order Number,Table/Room,Total Amount,Status,Date,Items\n';
    
    for (let o of orders) {
      const itemsString = o.items.map(i => `${i.name} (x${i.quantity})`).join('; ');
      const dateStr = o.createdAt.toISOString().slice(0, 10);
      csv += `"${o.orderNumber || ''}","${o.tableName}",${o.totalAmount},"${o.status}","${dateStr}","${itemsString}"\n`;
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
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
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
  const { status } = req.body;
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
      // Emit to specific customer order room
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
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
