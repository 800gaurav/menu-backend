const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');

// GET /api/manifest/:slug
router.get('/:slug', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const pwaName = restaurant.brandingSettings?.pwaName || restaurant.name;
    const themeColor = restaurant.brandColor || '#003b1b';

    const manifest = {
      name: pwaName,
      short_name: pwaName,
      description: restaurant.brandingSettings?.tagline || `Order online from ${restaurant.name}`,
      start_url: `/menu/${restaurant.slug}`,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: themeColor,
      icons: [
        {
          src: restaurant.logo || '/logo192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: restaurant.logo || '/logo512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
