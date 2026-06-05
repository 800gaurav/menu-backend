const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('restaurantadmin'));

router.get('/customers', async (req, res) => {
  try {
    const { search = '', occasion } = req.query;
    const query = { restaurantId: req.user.restaurantId };
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { mobile: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    if (occasion === 'birthday') query.dateOfBirth = { $ne: null };
    if (occasion === 'anniversary') query.anniversaryDate = { $ne: null };
    const customers = await Customer.find(query).sort({ lastVisitAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/customers/export', async (req, res) => {
  try {
    const customers = await Customer.find({ restaurantId: req.user.restaurantId }).sort({ lastVisitAt: -1 });
    let csv = 'Name,Mobile,Email,Date Of Birth,Anniversary,Visits,Total Spend,Last Visit\n';
    customers.forEach((c) => {
      csv += `"${c.name || ''}","${c.mobile || ''}","${c.email || ''}","${c.dateOfBirth ? c.dateOfBirth.toISOString().slice(0, 10) : ''}","${c.anniversaryDate ? c.anniversaryDate.toISOString().slice(0, 10) : ''}",${c.visitCount || 0},${c.totalSpend || 0},"${c.lastVisitAt ? c.lastVisitAt.toISOString() : ''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    const orders = await Order.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ customer, orders });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
