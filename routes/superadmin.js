const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Restaurant = require('../models/Restaurant');
const RestaurantAdmin = require('../models/RestaurantAdmin');
const Order = require('../models/Order');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes here
router.use(authenticate, authorize('superadmin'));

// GET /api/superadmin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const totalRestaurants = await Restaurant.countDocuments();
    const activeRestaurants = await Restaurant.countDocuments({ isActive: true });
    const suspendedRestaurants = totalRestaurants - activeRestaurants;
    
    // Aggregate stats from orders
    const totalOrders = await Order.countDocuments();
    const activeOrders = await Order.countDocuments({ 
      status: { $in: ['New', 'Accepted', 'Preparing', 'Ready', 'Served'] } 
    });
    
    // Revenue calculations
    const revenueRes = await Order.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueRes.length > 0 ? revenueRes[0].total : 0;

    res.json({
      totalRestaurants,
      activeRestaurants,
      suspendedRestaurants,
      totalOrders,
      activeOrders,
      totalRevenue
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/superadmin/restaurants
router.get('/restaurants', async (req, res) => {
  try {
    const restaurants = await Restaurant.find().sort({ createdAt: -1 });
    const populatedList = [];
    for (let r of restaurants) {
      const admin = await RestaurantAdmin.findOne({ restaurantId: r._id });
      const stats = {
        totalOrders: await Order.countDocuments({ restaurantId: r._id }),
        revenue: (await Order.aggregate([
          { $match: { restaurantId: r._id, status: 'Completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]))[0]?.total || 0
      };
      populatedList.push({
        ...r.toObject(),
        username: admin ? admin.username : 'N/A',
        plainPassword: admin ? admin.plainPassword : null,
        mobile: admin ? admin.mobile : null,
        isOnboarded: admin ? admin.isOnboarded : false,
        adminId: admin ? admin._id : null,
        stats
      });
    }
    res.json(populatedList);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/superadmin/restaurants
router.post('/restaurants', async (req, res) => {
  const { name, slug, email, mobile, packageLevel, features } = req.body;
  try {
    const existingRestaurant = await Restaurant.findOne({ slug });
    if (existingRestaurant) return res.status(400).json({ message: 'Restaurant slug already exists' });

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const generatedUsername = `${cleanSlug}_admin`;
    const generatedPassword = Math.random().toString(36).slice(-8);

    const newRestaurant = new Restaurant({
      name, slug: cleanSlug, email,
      package: packageLevel || 'Starter',
      isActive: true,
      features: features || { tableOrdering: true, roomOrdering: true, selfCheckout: true, kitchenPanel: true, customerDataCollection: false, crm: true, analytics: true, qrGenerator: true },
      plan: {
        name: packageLevel || 'Starter',
        maxTables: packageLevel === 'Enterprise' ? 500 : packageLevel === 'Professional' ? 100 : 20,
        maxMenuItems: packageLevel === 'Enterprise' ? 2000 : packageLevel === 'Professional' ? 500 : 100,
        price: packageLevel === 'Enterprise' ? 0 : packageLevel === 'Professional' ? 2499 : 999,
        billingCycle: 'monthly', startDate: new Date()
      },
      brandingSettings: { tagline: `Welcome to ${name}`, pwaName: name, pageTitle: name, footerText: 'Thank you for visiting!' }
    });
    const savedRestaurant = await newRestaurant.save();

    const hashedPassword = await bcrypt.hash(generatedPassword, 10);
    const newAdmin = new RestaurantAdmin({
      restaurantId: savedRestaurant._id,
      username: generatedUsername,
      password: hashedPassword,
      plainPassword: generatedPassword,
      mobile: mobile || '',
      isOnboarded: false
    });
    await newAdmin.save();

    res.status(201).json({
      restaurant: savedRestaurant,
      credentials: { username: generatedUsername, password: generatedPassword }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/superadmin/restaurants/:id
router.get('/restaurants/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    const admin = await RestaurantAdmin.findOne({ restaurantId: restaurant._id });
    
    res.json({
      ...restaurant.toObject(),
      username: admin ? admin.username : 'N/A',
      plainPassword: admin ? admin.plainPassword : null,
      mobile: admin ? admin.mobile : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/superadmin/restaurants/:id
router.put('/restaurants/:id', async (req, res) => {
  const { name, slug, email, packageLevel, features } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Check slug collision
    if (slug && slug !== restaurant.slug) {
      const collision = await Restaurant.findOne({ slug });
      if (collision) {
        return res.status(400).json({ message: 'Slug already in use' });
      }
      restaurant.slug = slug;
    }

    if (name) restaurant.name = name;
    if (email) restaurant.email = email;
    if (packageLevel) restaurant.package = packageLevel;
    if (features) restaurant.features = features;

    const updated = await restaurant.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/superadmin/restaurants/:id/toggle-active
router.patch('/restaurants/:id/toggle-active', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    restaurant.isActive = !restaurant.isActive;
    await restaurant.save();
    res.json({ message: 'Restaurant activation toggled', isActive: restaurant.isActive });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/superadmin/restaurants/:id/plan
router.patch('/restaurants/:id/plan', async (req, res) => {
  const { name, maxTables, maxMenuItems, price, billingCycle, startDate, endDate } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    if (!['Starter', 'Professional', 'Enterprise'].includes(name)) {
      return res.status(400).json({ message: 'Invalid subscription package' });
    }
    restaurant.plan = { name, maxTables, maxMenuItems, price, billingCycle, startDate, endDate };
    // Sync package field for backward compat
    restaurant.package = name;
    await restaurant.save();
    res.json(restaurant);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/superadmin/restaurants/:id/features
router.patch('/restaurants/:id/features', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    restaurant.features = { ...restaurant.features.toObject?.() || restaurant.features, ...req.body };
    await restaurant.save();
    res.json(restaurant);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/superadmin/restaurants/:id/orders
router.get('/restaurants/:id/orders', async (req, res) => {
  try {
    const { limit = 20, status } = req.query;
    const query = { restaurantId: req.params.id };
    if (status) query.status = status;
    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(parseInt(limit));
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/superadmin/impersonate/:restaurantId
// SuperAdmin can login as any restaurant admin directly
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
router.post('/impersonate/:restaurantId', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    const admin = await RestaurantAdmin.findOne({ restaurantId: restaurant._id });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: 'restaurantadmin', restaurantId: admin.restaurantId },
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

module.exports = router;
