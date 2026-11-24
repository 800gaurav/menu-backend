const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Restaurant = require('../models/Restaurant');
const RestaurantAdmin = require('../models/RestaurantAdmin');
const Order = require('../models/Order');
const Plan = require('../models/Plan');
const { authenticate, authorize } = require('../middleware/auth');

function applySubscriptionPlan(restaurant, plan, explicitFeatures = null, explicitEndDate = null) {
  const samePlan = plan && restaurant.planId && restaurant.planId.toString() === plan._id.toString();
  restaurant.planId = plan ? plan._id : null;
  restaurant.package = plan ? plan.name : 'No plan';

  const defaultFeatures = {
    tableOrdering: true,
    roomOrdering: true,
    selfCheckout: true,
    kitchenPanel: true,
    counterPanel: true,
    waiterPanel: true,
    customerLogin: false,
    qrGenerator: true,
    customerDataCollection: false,
    crm: true,
    analytics: true,
    subscriptions: true
  };

  const planFeatures = plan?.features
    ? (typeof plan.features.toObject === 'function' ? plan.features.toObject() : plan.features)
    : {};

  // Merge default -> plan features -> explicit overrides
  restaurant.features = {
    ...defaultFeatures,
    ...planFeatures,
    ...(explicitFeatures || {})
  };

  const now = new Date();
  let defaultEndDate = new Date();
  if (plan?.billingCycle === 'yearly') {
    defaultEndDate.setFullYear(defaultEndDate.getFullYear() + 1);
  } else if (plan?.billingCycle === 'trial') {
    const trialDays = typeof plan.trialDays === 'number' && plan.trialDays > 0 ? plan.trialDays : 7;
    defaultEndDate.setDate(defaultEndDate.getDate() + trialDays);
  } else {
    defaultEndDate.setDate(defaultEndDate.getDate() + 30);
  }

  const finalEndDate = explicitEndDate 
    ? new Date(explicitEndDate)
    : (samePlan && restaurant.plan?.endDate ? restaurant.plan.endDate : defaultEndDate);

  restaurant.plan = plan ? {
    name: plan.name,
    maxTables: typeof plan.features?.maxTables === 'number' ? plan.features.maxTables : 20,
    maxMenuItems: typeof plan.features?.maxMenuItems === 'number' ? plan.features.maxMenuItems : 100,
    price: plan.price || 0,
    billingCycle: plan.billingCycle || 'monthly',
    trialDays: plan.billingCycle === 'trial' ? (plan.trialDays || 7) : 0,
    startDate: samePlan && restaurant.plan?.startDate
      ? restaurant.plan.startDate
      : now,
    endDate: finalEndDate
  } : {
    name: 'No plan',
    maxTables: 0,
    maxMenuItems: 0,
    price: 0,
    billingCycle: 'monthly',
    trialDays: 0,
    startDate: now,
    endDate: finalEndDate
  };
}

// Protect all routes here
router.use(authenticate, authorize('superadmin'));

// GET /api/superadmin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const totalRestaurants = await Restaurant.countDocuments();
    const activeRestaurants = await Restaurant.countDocuments({ isActive: true });
    const suspendedRestaurants = totalRestaurants - activeRestaurants;
    
    // Revenue calculations
    const revenueRes = await Order.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueRes.length > 0 ? revenueRes[0].total : 0;

    // Dates for expiring calculations
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Restaurants expiring this week (endDate between now and 7 days from now)
    const expiringThisWeekDocs = await Restaurant.find({
      'plan.endDate': { $gte: startOfToday, $lte: endOfWeek }
    }).sort({ 'plan.endDate': 1 });

    const expiringThisWeekList = [];
    for (const r of expiringThisWeekDocs) {
      const admin = await RestaurantAdmin.findOne({ restaurantId: r._id });
      expiringThisWeekList.push({
        _id: r._id,
        name: r.name,
        slug: r.slug,
        package: r.package,
        plan: r.plan,
        endDate: r.plan?.endDate,
        email: r.email,
        mobile: admin ? admin.mobile : r.mobile,
        username: admin ? admin.username : null,
        isActive: r.isActive
      });
    }

    // Restaurants whose plan has expired (endDate < today)
    const expiredDocs = await Restaurant.find({
      'plan.endDate': { $lt: startOfToday }
    }).sort({ 'plan.endDate': -1 });

    const expiredList = [];
    for (const r of expiredDocs) {
      const admin = await RestaurantAdmin.findOne({ restaurantId: r._id });
      expiredList.push({
        _id: r._id,
        name: r.name,
        slug: r.slug,
        package: r.package,
        plan: r.plan,
        endDate: r.plan?.endDate,
        email: r.email,
        mobile: admin ? admin.mobile : r.mobile,
        username: admin ? admin.username : null,
        isActive: r.isActive
      });
    }

    res.json({
      totalRestaurants,
      activeRestaurants,
      suspendedRestaurants,
      totalRevenue,
      expiringThisWeekCount: expiringThisWeekList.length,
      expiringThisWeekList,
      expiredCount: expiredList.length,
      expiredList
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
      
      const activeOrders = await Order.find({ 
        restaurantId: r._id, 
        status: { $in: ['New', 'Accepted', 'Preparing', 'Ready', 'Served'] } 
      });
      const activeTablesCount = [...new Set(activeOrders.map(o => o.tableName))].length;
      
      let activeStaffCount = 0;
      if (r.features) {
        if (r.features.kitchenPanel) activeStaffCount++;
        if (r.features.counterPanel) activeStaffCount++;
        if (r.features.waiterPanel) activeStaffCount++;
      }

      const stats = {
        totalOrders: await Order.countDocuments({ restaurantId: r._id }),
        activeTables: activeTablesCount,
        activeStaff: activeStaffCount,
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
  const { name, slug, email, mobile, planId, features, endDate } = req.body;
  try {
    const existingRestaurant = await Restaurant.findOne({ slug });
    if (existingRestaurant) return res.status(400).json({ message: 'Restaurant slug already exists' });

    if (planId && !mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }
    const selectedPlan = planId ? await Plan.findById(planId) : null;
    if (planId && !selectedPlan) {
      return res.status(400).json({ message: 'Selected subscription plan was not found' });
    }

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const generatedUsername = `${cleanSlug}_admin`;
    const generatedPassword = Math.random().toString(36).slice(-8);

    const newRestaurant = new Restaurant({
      name,
      slug: cleanSlug,
      email,
      isActive: true,
      brandingSettings: { tagline: `Welcome to ${name}`, pwaName: name, pageTitle: name, footerText: 'Thank you for visiting!' }
    });

    applySubscriptionPlan(newRestaurant, selectedPlan, features, endDate);
    if (endDate) {
      newRestaurant.plan.endDate = new Date(endDate);
    }
    const savedRestaurant = await newRestaurant.save();

    const hashedPassword = await bcrypt.hash(generatedPassword, 10);
    const newAdmin = new RestaurantAdmin({
      restaurantId: savedRestaurant._id,
      username: generatedUsername,
      password: hashedPassword,
      plainPassword: generatedPassword,
      mobile: mobile || '',
      isOnboarded: true
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
    
    const activeOrders = await Order.find({ 
      restaurantId: restaurant._id, 
      status: { $in: ['New', 'Accepted', 'Preparing', 'Ready', 'Served'] } 
    });
    const activeTablesCount = [...new Set(activeOrders.map(o => o.tableName))].length;
    
    let activeStaffCount = 0;
    if (restaurant.features) {
      if (restaurant.features.kitchenPanel) activeStaffCount++;
      if (restaurant.features.counterPanel) activeStaffCount++;
      if (restaurant.features.waiterPanel) activeStaffCount++;
    }

    const totalOrders = await Order.countDocuments({ restaurantId: restaurant._id });
    const revenueRes = await Order.aggregate([
      { $match: { restaurantId: restaurant._id, status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const revenue = revenueRes[0]?.total || 0;

    res.json({
      ...restaurant.toObject(),
      username: admin ? admin.username : 'N/A',
      plainPassword: admin ? admin.plainPassword : null,
      mobile: admin ? admin.mobile : null,
      stats: {
        totalOrders,
        activeTables: activeTablesCount,
        activeStaff: activeStaffCount,
        revenue
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/superadmin/restaurants/:id
router.put('/restaurants/:id', async (req, res) => {
  const { name, slug, email, mobile, planId, packageLevel, features, endDate } = req.body;
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
    if (mobile !== undefined) restaurant.mobile = mobile;

    if (planId !== undefined || packageLevel !== undefined) {
      let selectedPlan = null;
      if (planId) {
        if (!mongoose.Types.ObjectId.isValid(planId)) {
          return res.status(400).json({ message: 'Invalid subscription plan' });
        }
        selectedPlan = await Plan.findById(planId);
        if (!selectedPlan) {
          return res.status(400).json({ message: 'Selected subscription plan was not found' });
        }
      } else if (packageLevel) {
        selectedPlan = await Plan.findOne({ name: packageLevel });
        if (!selectedPlan) {
          return res.status(400).json({ message: 'Selected subscription plan was not found' });
        }
      }
      applySubscriptionPlan(restaurant, selectedPlan, features, endDate);
    } else if (features) {
      restaurant.features = {
        ...(restaurant.features?.toObject?.() || restaurant.features || {}),
        ...features
      };
    }

    if (endDate) {
      if (!restaurant.plan) restaurant.plan = {};
      restaurant.plan.endDate = new Date(endDate);
    }

    const updated = await restaurant.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/superadmin/restaurants/:id/expiry
router.patch('/restaurants/:id/expiry', async (req, res) => {
  const { endDate } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    if (!endDate) return res.status(400).json({ message: 'Expiry date is required' });

    if (!restaurant.plan) {
      restaurant.plan = {};
    }
    restaurant.plan.endDate = new Date(endDate);
    await restaurant.save();
    res.json({ message: 'Plan expiry date updated successfully', plan: restaurant.plan });
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
  const { planId, name, features } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

    let selectedPlan = null;
    if (planId) {
      if (!mongoose.Types.ObjectId.isValid(planId)) {
        return res.status(400).json({ message: 'Invalid subscription plan' });
      }
      selectedPlan = await Plan.findById(planId);
    } else if (name) {
      selectedPlan = await Plan.findOne({ name });
    }
    if ((planId || name) && !selectedPlan) {
      return res.status(400).json({ message: 'Selected subscription plan was not found' });
    }
    applySubscriptionPlan(restaurant, selectedPlan, features);
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
    
    const current = restaurant.features?.toObject?.() || restaurant.features || {};
    restaurant.features = {
      ...current,
      ...req.body
    };

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
      { expiresIn: '30d' }
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

// Plans CRUD
// GET /api/superadmin/plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find().sort({ price: 1 });
    const plansWithCounts = await Promise.all(plans.map(async (p) => {
      const restaurantCount = await Restaurant.countDocuments({
        $or: [{ planId: p._id }, { package: p.name }]
      });
      return {
        ...p.toObject(),
        restaurantCount
      };
    }));
    res.json(plansWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/superadmin/plans
router.post('/plans', async (req, res) => {
  const { name, price, billingCycle, trialDays, description, features } = req.body;
  try {
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Plan name is required' });
    }
    const cleanName = name.trim();
    const existing = await Plan.findOne({ name: cleanName });
    if (existing) {
      return res.status(400).json({ message: 'A plan with this name already exists' });
    }

    const plan = new Plan({
      name: cleanName,
      price: Number(price) || 0,
      billingCycle: billingCycle || 'monthly',
      trialDays: billingCycle === 'trial' ? (Number(trialDays) || 7) : 0,
      description: description || '',
      features: {
        tableOrdering: features?.tableOrdering !== undefined ? !!features.tableOrdering : true,
        roomOrdering: features?.roomOrdering !== undefined ? !!features.roomOrdering : true,
        selfCheckout: features?.selfCheckout !== undefined ? !!features.selfCheckout : true,
        kitchenPanel: features?.kitchenPanel !== undefined ? !!features.kitchenPanel : true,
        counterPanel: features?.counterPanel !== undefined ? !!features.counterPanel : true,
        waiterPanel: features?.waiterPanel !== undefined ? !!features.waiterPanel : true,
        customerLogin: features?.customerLogin !== undefined ? !!features.customerLogin : false,
        qrGenerator: features?.qrGenerator !== undefined ? !!features.qrGenerator : true,
        customerDataCollection: features?.customerDataCollection !== undefined ? !!features.customerDataCollection : false,
        crm: features?.crm !== undefined ? !!features.crm : true,
        analytics: features?.analytics !== undefined ? !!features.analytics : true,
        maxTables: typeof features?.maxTables === 'number' ? features.maxTables : (Number(features?.maxTables) || 20),
        maxMenuItems: typeof features?.maxMenuItems === 'number' ? features.maxMenuItems : (Number(features?.maxMenuItems) || 100),
        maxCategories: typeof features?.maxCategories === 'number' ? features.maxCategories : (Number(features?.maxCategories) || 15)
      }
    });

    await plan.save();
    res.status(201).json({ ...plan.toObject(), restaurantCount: 0 });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/superadmin/plans/:id
router.put('/plans/:id', async (req, res) => {
  const { name, price, billingCycle, trialDays, description, features, syncRestaurants } = req.body;
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    if (name && name.trim() !== plan.name) {
      const cleanName = name.trim();
      const existing = await Plan.findOne({ name: cleanName, _id: { $ne: plan._id } });
      if (existing) {
        return res.status(400).json({ message: 'Another plan with this name already exists' });
      }
      plan.name = cleanName;
    }
    if (price !== undefined) plan.price = Number(price);
    if (billingCycle) {
      plan.billingCycle = billingCycle;
      if (billingCycle === 'trial') {
        plan.trialDays = Number(trialDays) || plan.trialDays || 7;
      }
    }
    if (trialDays !== undefined && plan.billingCycle === 'trial') {
      plan.trialDays = Number(trialDays) || 7;
    }
    if (description !== undefined) plan.description = description;
    
    if (features) {
      const currentFeatures = plan.features ? (typeof plan.features.toObject === 'function' ? plan.features.toObject() : plan.features) : {};
      plan.features = {
        ...currentFeatures,
        ...features,
        maxTables: typeof features.maxTables !== 'undefined' ? Number(features.maxTables) : currentFeatures.maxTables,
        maxMenuItems: typeof features.maxMenuItems !== 'undefined' ? Number(features.maxMenuItems) : currentFeatures.maxMenuItems,
        maxCategories: typeof features.maxCategories !== 'undefined' ? Number(features.maxCategories) : currentFeatures.maxCategories
      };
    }

    await plan.save();

    // If syncRestaurants is requested, update existing restaurants subscribed to this plan
    if (syncRestaurants) {
      const subscribedRestaurants = await Restaurant.find({
        $or: [{ planId: plan._id }, { package: plan.name }]
      });
      for (const rest of subscribedRestaurants) {
        applySubscriptionPlan(rest, plan);
        await rest.save();
      }
    }

    const restaurantCount = await Restaurant.countDocuments({
      $or: [{ planId: plan._id }, { package: plan.name }]
    });

    res.json({ ...plan.toObject(), restaurantCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/superadmin/plans/:id
router.delete('/plans/:id', async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    const restaurantCount = await Restaurant.countDocuments({
      $or: [{ planId: plan._id }, { package: plan.name }]
    });

    if (restaurantCount > 0) {
      return res.status(400).json({
        message: `Cannot delete plan "${plan.name}" because ${restaurantCount} restaurant(s) are currently subscribed to it. Please reassign those restaurants first.`
      });
    }

    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
