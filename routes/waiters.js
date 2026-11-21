const express = require('express');
const router = express.Router();
const Waiter = require('../models/Waiter');
const Order = require('../models/Order');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all waiter management routes under admin privilege
router.use(authenticate, authorize(['restaurantadmin']));

// GET /api/waiters - List all waiters
router.get('/', async (req, res) => {
  try {
    const waiters = await Waiter.find({ restaurantId: req.user.restaurantId });
    res.json(waiters);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/waiters - Create new waiter
router.post('/', async (req, res) => {
  const { name, pin } = req.body;
  try {
    if (!name || !pin || pin.length !== 4 || isNaN(pin)) {
      return res.status(400).json({ message: 'Valid Name and a 4-digit PIN is required.' });
    }

    // Check if PIN is already taken in this restaurant
    const exists = await Waiter.findOne({ restaurantId: req.user.restaurantId, pin });
    if (exists) {
      return res.status(400).json({ message: 'A waiter with this PIN already exists. Please choose a different PIN.' });
    }

    const waiter = new Waiter({
      restaurantId: req.user.restaurantId,
      name,
      pin
    });

    await waiter.save();
    res.status(201).json(waiter);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/waiters/:id - Update waiter details
router.put('/:id', async (req, res) => {
  const { name, pin, isActive } = req.body;
  try {
    const waiter = await Waiter.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!waiter) {
      return res.status(404).json({ message: 'Waiter not found' });
    }

    if (name) waiter.name = name;
    if (isActive !== undefined) waiter.isActive = isActive;
    
    if (pin) {
      if (pin.length !== 4 || isNaN(pin)) {
        return res.status(400).json({ message: 'PIN must be a 4-digit number.' });
      }
      // Check if duplicate pin
      const exists = await Waiter.findOne({ 
        restaurantId: req.user.restaurantId, 
        pin, 
        _id: { $ne: req.params.id } 
      });
      if (exists) {
        return res.status(400).json({ message: 'This PIN is already in use by another waiter.' });
      }
      waiter.pin = pin;
    }

    await waiter.save();
    res.json(waiter);
  } catch (error) {
    res.status(505).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/waiters/:id - Delete waiter account
router.delete('/:id', async (req, res) => {
  try {
    const waiter = await Waiter.findOneAndDelete({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!waiter) {
      return res.status(404).json({ message: 'Waiter not found' });
    }
    res.json({ message: 'Waiter deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/waiters/stats - Get sales performance by waiter
router.get('/performance', async (req, res) => {
  try {
    const waiters = await Waiter.find({ restaurantId: req.user.restaurantId });
    const performanceStats = [];

    for (let w of waiters) {
      const orders = await Order.find({
        restaurantId: req.user.restaurantId,
        waiterId: w._id,
        placedBy: 'waiter'
      });

      const totalRevenue = orders
        .filter(o => o.status === 'Completed' || o.paymentStatus === 'Paid')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

      performanceStats.push({
        _id: w._id,
        name: w.name,
        pin: w.pin,
        isActive: w.isActive,
        totalOrdersCount: orders.length,
        completedOrdersCount: orders.filter(o => o.status === 'Completed').length,
        totalRevenue
      });
    }

    res.json(performanceStats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
