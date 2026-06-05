const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Restaurant = require('../models/Restaurant');
const RestaurantAdmin = require('../models/RestaurantAdmin');
const Order = require('../models/Order');
const TableOrRoom = require('../models/TableOrRoom');
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
router.use(authenticate, authorize('restaurantadmin'));

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
  const { name, phone, address, brandColor, googleMapsLink, reviewLink, socialLinks } = req.body;
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
  const { tagline, pwaName, pageTitle, footerText, showGoogleReview, showInstagram, showFacebook, showWhatsapp } = req.body;
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
      showGoogleReview: showGoogleReview !== undefined ? showGoogleReview : restaurant.brandingSettings.showGoogleReview,
      showInstagram: showInstagram !== undefined ? showInstagram : restaurant.brandingSettings.showInstagram,
      showFacebook: showFacebook !== undefined ? showFacebook : restaurant.brandingSettings.showFacebook,
      showWhatsapp: showWhatsapp !== undefined ? showWhatsapp : restaurant.brandingSettings.showWhatsapp
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
    const restaurantId = req.user.restaurantId;
    
    // Total tables/rooms
    const totalTables = await TableOrRoom.countDocuments({ restaurantId });
    
    // Orders today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayOrdersCount = await Order.countDocuments({
      restaurantId,
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });

    // Today's revenue
    const revenueRes = await Order.aggregate([
      {
        $match: {
          restaurantId: new require('mongoose').Types.ObjectId(restaurantId),
          status: 'Completed',
          createdAt: { $gte: startOfToday, $lte: endOfToday }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const todayRevenue = revenueRes.length > 0 ? revenueRes[0].total : 0;

    // Active pending/preparing orders
    const activeOrdersCount = await Order.countDocuments({
      restaurantId,
      status: { $in: ['New', 'Accepted', 'Preparing', 'Ready'] }
    });

    res.json({
      totalTables,
      todayOrdersCount,
      todayRevenue,
      activeOrdersCount
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

module.exports = router;
