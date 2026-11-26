const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Restaurant = require('../models/Restaurant');
const RestaurantAdmin = require('../models/RestaurantAdmin');
const Order = require('../models/Order');
const TableOrRoom = require('../models/TableOrRoom');
const WaiterCall = require('../models/WaiterCall');
const { authenticate, authorize } = require('../middleware/auth');

// Make sure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Protect all routes here
router.use(authenticate, authorize(['restaurantadmin', 'kitchen', 'counter', 'waiter']));

// GET /api/restaurant/profile
router.get('/profile', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    const admin = await RestaurantAdmin.findOne({ restaurantId: restaurant._id });
    res.json({
      ...restaurant.toObject(),
      isOnboarded: admin ? admin.isOnboarded : false
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/restaurant/profile
router.put('/profile', async (req, res) => {
  const { name, phone, address, brandColor, googleMapsLink, reviewLink, socialLinks, banners, pins } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    if (name) restaurant.name = name;
    if (phone !== undefined) restaurant.phone = phone;
    if (address !== undefined) restaurant.address = address;
    if (brandColor) restaurant.brandColor = brandColor;
    if (googleMapsLink !== undefined) restaurant.googleMapsLink = googleMapsLink;
    if (reviewLink !== undefined) restaurant.reviewLink = reviewLink;
    if (socialLinks) restaurant.socialLinks = { ...restaurant.socialLinks, ...socialLinks };
    if (banners !== undefined) restaurant.banners = banners;

    if (pins) {
      if (pins.kitchen && (pins.kitchen.length !== 4 || isNaN(pins.kitchen))) {
        return res.status(400).json({ message: 'Kitchen PIN must be a 4-digit number.' });
      }
      if (pins.counter && (pins.counter.length !== 4 || isNaN(pins.counter))) {
        return res.status(400).json({ message: 'Counter PIN must be a 4-digit number.' });
      }
      restaurant.pins = {
        kitchen: pins.kitchen || restaurant.pins.kitchen,
        counter: pins.counter || restaurant.pins.counter,
        waiter: pins.waiter || restaurant.pins.waiter || '3333'
      };
    }

    const updated = await restaurant.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/restaurant/customer-data-settings
router.put('/customer-data-settings', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    if (!restaurant.features.customerDataCollection) {
      return res.status(403).json({ message: 'Customer data collection is disabled by Super Admin' });
    }
    restaurant.customerDataSettings = {
      ...(restaurant.customerDataSettings.toObject?.() || restaurant.customerDataSettings),
      ...req.body,
      fields: {
        ...(restaurant.customerDataSettings.fields.toObject?.() || restaurant.customerDataSettings.fields),
        ...(req.body.fields || {})
      }
    };
    await restaurant.save();
    res.json(restaurant.customerDataSettings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/restaurant/action-buttons
router.put('/action-buttons', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    restaurant.actionButtons = Array.isArray(req.body.actionButtons) ? req.body.actionButtons : [];
    await restaurant.save();
    res.json(restaurant.actionButtons);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/restaurant/branding
router.put('/branding', async (req, res) => {
  const { 
    tagline, pwaName, pageTitle, footerText, menuItemLayout,
    showGoogleReview, showInstagram, showFacebook, showWhatsapp,
    waiterAppName, kitchenAppName, adminAppName, counterAppName,
    userAppLogo, waiterAppLogo, kitchenAppLogo, adminAppLogo, counterAppLogo
  } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    restaurant.brandingSettings = {
      ...restaurant.brandingSettings,
      tagline: tagline !== undefined ? tagline : restaurant.brandingSettings.tagline,
      pwaName: pwaName !== undefined ? pwaName : restaurant.brandingSettings.pwaName,
      pageTitle: pageTitle !== undefined ? pageTitle : restaurant.brandingSettings.pageTitle,
      footerText: footerText !== undefined ? footerText : restaurant.brandingSettings.footerText,
      menuItemLayout: menuItemLayout !== undefined ? menuItemLayout : (restaurant.brandingSettings.menuItemLayout || 'list'),
      showGoogleReview: showGoogleReview !== undefined ? showGoogleReview : restaurant.brandingSettings.showGoogleReview,
      showInstagram: showInstagram !== undefined ? showInstagram : restaurant.brandingSettings.showInstagram,
      showFacebook: showFacebook !== undefined ? showFacebook : restaurant.brandingSettings.showFacebook,
      showWhatsapp: showWhatsapp !== undefined ? showWhatsapp : restaurant.brandingSettings.showWhatsapp,
      
      // Panel specific custom names
      waiterAppName: waiterAppName !== undefined ? waiterAppName : restaurant.brandingSettings.waiterAppName,
      kitchenAppName: kitchenAppName !== undefined ? kitchenAppName : restaurant.brandingSettings.kitchenAppName,
      adminAppName: adminAppName !== undefined ? adminAppName : restaurant.brandingSettings.adminAppName,
      counterAppName: counterAppName !== undefined ? counterAppName : restaurant.brandingSettings.counterAppName,

      // Panel specific custom logos
      userAppLogo: userAppLogo !== undefined ? userAppLogo : restaurant.brandingSettings.userAppLogo,
      waiterAppLogo: waiterAppLogo !== undefined ? waiterAppLogo : restaurant.brandingSettings.waiterAppLogo,
      kitchenAppLogo: kitchenAppLogo !== undefined ? kitchenAppLogo : restaurant.brandingSettings.kitchenAppLogo,
      adminAppLogo: adminAppLogo !== undefined ? adminAppLogo : restaurant.brandingSettings.adminAppLogo,
      counterAppLogo: counterAppLogo !== undefined ? counterAppLogo : restaurant.brandingSettings.counterAppLogo
    };

    const updated = await restaurant.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/restaurant/wizard/complete
router.post('/wizard/complete', async (req, res) => {
  try {
    const admin = await RestaurantAdmin.findOne({ restaurantId: req.user.restaurantId });
    if (!admin) {
      return res.status(404).json({ message: 'Admin profile not found' });
    }
    admin.isOnboarded = true;
    await admin.save();
    res.json({ message: 'Onboarding setup wizard completed successfully', isOnboarded: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/restaurant/dashboard/stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const restaurantId = new mongoose.Types.ObjectId(req.user.restaurantId);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    lastWeekStart.setHours(0, 0, 0, 0);

    const monthlyStart = new Date(now);
    monthlyStart.setDate(monthlyStart.getDate() - 30);
    monthlyStart.setHours(0, 0, 0, 0);

    const trendStart = new Date(now);
    trendStart.setDate(trendStart.getDate() - 29);
    trendStart.setHours(0, 0, 0, 0);

    const [
      todayOrdersCount,
      todayRevenueRes,
      orderQueueCounts,
      pendingWaiterCallsCount,
      lastWeekRevenueRes,
      monthlyRevenueRes,
      lifetimeRevenueRes,
      lifetimeOrdersCount,
      salesTrend
    ] = await Promise.all([
      Order.countDocuments({ restaurantId, createdAt: { $gte: startOfToday, $lte: endOfToday } }),
      Order.aggregate([
        { $match: { restaurantId, status: 'Completed', createdAt: { $gte: startOfToday, $lte: endOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { restaurantId, status: { $in: ['New', 'Accepted', 'Preparing', 'Ready', 'Served'] } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      WaiterCall.countDocuments({ restaurantId: { $in: [restaurantId, String(restaurantId)] }, isAttended: false }),
      Order.aggregate([
        { $match: { restaurantId, status: 'Completed', createdAt: { $gte: lastWeekStart } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { restaurantId, status: 'Completed', createdAt: { $gte: monthlyStart } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { restaurantId, status: 'Completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.countDocuments({ restaurantId }),
      Order.aggregate([
        { $match: { restaurantId, status: { $ne: 'Cancelled' }, createdAt: { $gte: trendStart } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', revenue: 1, count: 1 } }
      ])
    ]);

    const orderCountsByStatus = Object.fromEntries(orderQueueCounts.map(({ _id, count }) => [_id, count]));
    const newOrdersCount = orderCountsByStatus.New || 0;
    const readyOrdersCount = orderCountsByStatus.Ready || 0;
    const cashierOrdersCount = orderCountsByStatus.Served || 0;
    const activeOrdersCount = ['New', 'Accepted', 'Preparing', 'Ready']
      .reduce((count, status) => count + (orderCountsByStatus[status] || 0), 0);

    res.json({
      todayOrdersCount,
      todayRevenue: todayRevenueRes[0]?.total || 0,
      lastWeekRevenue: lastWeekRevenueRes[0]?.total || 0,
      monthlyRevenue: monthlyRevenueRes[0]?.total || 0,
      activeOrdersCount,
      newOrdersCount,
      cashierOrdersCount,
      readyOrdersCount,
      pendingWaiterCallsCount,
      lifetimeRevenue: lifetimeRevenueRes[0]?.total || 0,
      lifetimeOrdersCount,
      salesTrend
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/restaurant/upload-logo
router.post('/upload-logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const logoUrl = `/uploads/${req.file.filename}`;
    
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    restaurant.logo = logoUrl;
    await restaurant.save();

    res.json({ logoUrl });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/restaurant/upload-image (generic image upload helper)
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/restaurant/customer-login-settings
router.put('/customer-login-settings', async (req, res) => {
  const { requireLogin, collectMobile, collectDOB, collectName } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    // Only allow if superadmin has enabled customerLogin feature
    if (!restaurant.features.customerLogin) {
      return res.status(403).json({ message: 'Customer login feature not enabled for this account' });
    }
    restaurant.customerLoginSettings = { requireLogin, collectMobile, collectDOB, collectName };
    await restaurant.save();
    res.json(restaurant.customerLoginSettings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/restaurant/generate-qr
router.post('/generate-qr', async (req, res) => {
  const { url, heading, subtext } = req.body;
  try {
    const QRCode = require('qrcode');
    const qrData = await QRCode.toDataURL(url, { width: 400, margin: 2 });
    res.json({ qrData, url, heading, subtext });
  } catch (error) {
    res.status(500).json({ message: 'QR generation failed', error: error.message });
  }
});

// POST /api/restaurant/change-password
router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    }

    const admin = await RestaurantAdmin.findOne({ restaurantId: req.user.restaurantId });
    if (!admin) {
      return res.status(404).json({ message: 'Restaurant administrator account not found.' });
    }

    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
