const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes
router.use(authenticate, authorize(['restaurantadmin', 'counter']));

// GET /api/counter/orders - Get active orders for billing table, prioritizing bill requests
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find({
      restaurantId: req.user.restaurantId,
      status: { $ne: 'Completed', $nin: ['Cancelled'] }
    }).sort({ billRequested: -1, createdAt: -1 });
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/counter/orders/:id/complete - Settle bill and mark as Completed
router.post('/orders/:id/complete', async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      restaurantId: req.user.restaurantId
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.status = 'Completed';
    order.completedAt = new Date();
    order.statusTimeline.push({ status: 'Completed', timestamp: new Date() });
    await order.save();

    // Trigger Socket.IO updates
    const io = req.app.get('io');
    if (io) {
      const restRoom = req.user.restaurantId.toString();
      io.to(restRoom).emit('orderUpdated', order);
      io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
      io.to(order._id.toString()).emit('orderStatusChanged', order);
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/counter/sales-summary - Daily summary
router.get('/sales-summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedToday = await Order.find({
      restaurantId: req.user.restaurantId,
      status: 'Completed',
      completedAt: { $gte: today }
    });

    const totalRevenue = completedToday.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageOrderVal = completedToday.length > 0 ? Math.round(totalRevenue / completedToday.length) : 0;

    res.json({
      count: completedToday.length,
      revenue: totalRevenue,
      averageValue: averageOrderVal
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
