const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const QRScan = require('../models/QRScan');
const Customer = require('../models/Customer');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('restaurantadmin'));

router.get('/dashboard', async (req, res) => {
  try {
    const restaurantId = new mongoose.Types.ObjectId(req.user.restaurantId);
    const since = new Date();
    since.setDate(since.getDate() - Number(req.query.days || 30));

    const [qrScans, revenue, mostOrderedItems, retention, tablePerformance, roomPerformance, peakHours] = await Promise.all([
      QRScan.countDocuments({ restaurantId, createdAt: { $gte: since } }),
      Order.aggregate([
        { $match: { restaurantId, status: { $in: ['Served', 'Completed'] }, createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, orders: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { restaurantId, createdAt: { $gte: since } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', quantity: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
        { $sort: { quantity: -1 } },
        { $limit: 10 }
      ]),
      Customer.aggregate([
        { $match: { restaurantId } },
        { $group: { _id: null, customers: { $sum: 1 }, returning: { $sum: { $cond: [{ $gt: ['$visitCount', 1] }, 1, 0] } } } }
      ]),
      Order.aggregate([
        { $match: { restaurantId, createdAt: { $gte: since } } },
        { $group: { _id: '$tableName', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { orders: -1 } },
        { $limit: 10 }
      ]),
      Order.aggregate([
        { $match: { restaurantId, tableName: /room/i, createdAt: { $gte: since } } },
        { $group: { _id: '$tableName', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { orders: -1 } },
        { $limit: 10 }
      ]),
      Order.aggregate([
        { $match: { restaurantId, createdAt: { $gte: since } } },
        { $group: { _id: { $hour: '$createdAt' }, orders: { $sum: 1 } } },
        { $sort: { orders: -1 } }
      ])
    ]);

    res.json({
      qrScans,
      revenue: revenue[0] || { total: 0, orders: 0 },
      mostOrderedItems,
      customerRetention: retention[0] || { customers: 0, returning: 0 },
      tablePerformance,
      roomPerformance,
      peakHours
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
