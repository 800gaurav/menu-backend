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
      status: 'Served'
    }).populate('customerId').populate('waiterId').sort({ billRequested: -1, createdAt: -1 });

    const grouped = {};
    for (const ord of orders) {
      const table = ord.tableName;
      if (!grouped[table]) {
        grouped[table] = {
          _id: ord._id,
          orderIds: [ord._id],
          tableName: table,
          orderNumber: ord.orderNumber,
          orderNumbers: [ord.orderNumber],
          status: 'Served',
          billRequested: ord.billRequested,
          customerId: ord.customerId,
          waiterId: ord.waiterId,
          items: [],
          totalAmount: 0,
          specialInstructions: ord.specialInstructions,
          placedBy: ord.placedBy,
          createdAt: ord.createdAt
        };
      } else {
        grouped[table].orderIds.push(ord._id);
        if (ord.orderNumber && !grouped[table].orderNumbers.includes(ord.orderNumber)) {
          grouped[table].orderNumbers.push(ord.orderNumber);
        }
        if (ord.billRequested) {
          grouped[table].billRequested = true;
        }
        if (!grouped[table].customerId && ord.customerId) {
          grouped[table].customerId = ord.customerId;
        }
        if (ord.specialInstructions) {
          if (grouped[table].specialInstructions) {
            grouped[table].specialInstructions += ` | ${ord.specialInstructions}`;
          } else {
            grouped[table].specialInstructions = ord.specialInstructions;
          }
        }
      }

      for (const it of ord.items) {
        const existingItem = grouped[table].items.find(
          item => item.name === it.name && item.variantName === it.variantName
        );
        if (existingItem) {
          existingItem.quantity += it.quantity;
        } else {
          grouped[table].items.push({
            name: it.name,
            variantName: it.variantName,
            quantity: it.quantity,
            price: it.price
          });
        }
      }

      grouped[table].totalAmount += ord.totalAmount;
    }

    const result = Object.values(grouped).map(g => {
      g.orderNumber = g.orderNumbers.filter(Boolean).join(', ');
      delete g.orderNumbers;
      return g;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/counter/orders/:id/complete - Settle bill and mark as Completed
router.post('/orders/:id/complete', async (req, res) => {
  try {
    const mainOrder = await Order.findOne({
      _id: req.params.id,
      restaurantId: req.user.restaurantId
    });

    if (!mainOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const tableOrders = await Order.find({
      restaurantId: req.user.restaurantId,
      tableName: mainOrder.tableName,
      status: 'Served'
    });

    const allOrdersToComplete = [mainOrder, ...tableOrders.filter(o => o._id.toString() !== mainOrder._id.toString())];

    const io = req.app.get('io');
    const restRoom = req.user.restaurantId.toString();

    const Customer = require('../models/Customer');
    for (const order of allOrdersToComplete) {
      order.status = 'Completed';
      order.completedAt = new Date();
      order.paymentStatus = 'Paid';
      order.statusTimeline.push({ status: 'Completed', timestamp: new Date() });
      await order.save();

      if (order.customerId) {
        await Customer.findByIdAndUpdate(order.customerId, {
          $inc: { totalSpend: order.totalAmount },
          $set: { lastVisitAt: order.completedAt }
        });
      }

      if (io) {
        io.to(restRoom).emit('orderUpdated', order);
        io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
        io.to(order._id.toString()).emit('orderStatusChanged', order);
      }
    }

    res.json({ message: 'Table settled successfully', completedCount: allOrdersToComplete.length });
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
