const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SuperAdmin = require('../models/SuperAdmin');
const RestaurantAdmin = require('../models/RestaurantAdmin');
const Restaurant = require('../models/Restaurant');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/superadmin/login
router.post('/superadmin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Find super admin by username or email
    const admin = await SuperAdmin.findOne({ 
      $or: [{ username: email }, { email: email }] 
    });
    
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: 'superadmin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: admin.username, role: 'superadmin' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/auth/restaurant/login
router.post('/restaurant/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await RestaurantAdmin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const restaurant = await Restaurant.findById(admin.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    if (!restaurant.isActive) {
      return res.status(403).json({ message: 'This restaurant account is suspended.' });
    }

    const token = jwt.sign(
      { 
        id: admin._id, 
        username: admin.username, 
        role: 'restaurantadmin', 
        restaurantId: admin.restaurantId 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      username: admin.username, 
      role: 'restaurantadmin', 
      restaurantId: admin.restaurantId,
      isOnboarded: admin.isOnboarded,
      restaurantSlug: restaurant.slug
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/auth/pin-login
router.post('/pin-login', async (req, res) => {
  const { slug, role, pin } = req.body;
  try {
    if (!['kitchen', 'counter', 'waiter'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role for PIN login' });
    }
    const restaurant = await Restaurant.findOne({ slug });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    
    // Check if the pin matches the configured pin
    const configuredPin = restaurant.pins ? restaurant.pins[role] : null;
    const defaultPins = { kitchen: '1111', counter: '2222', waiter: '3333' };
    const targetPin = configuredPin || defaultPins[role];

    if (pin !== targetPin) {
      return res.status(401).json({ message: 'Invalid PIN' });
    }

    const token = jwt.sign(
      { 
        role: role, 
        restaurantId: restaurant._id,
        restaurantSlug: restaurant.slug
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ 
      token, 
      role, 
      restaurantId: restaurant._id,
      restaurantSlug: restaurant.slug
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
