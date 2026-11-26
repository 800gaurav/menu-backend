const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const backendUrl = process.env.BACKEND_URL;

// Helper to construct dynamic manifests with guaranteed valid PNG icons
const buildManifest = ({ name, shortName, desc, startUrl, scope, logo, themeColor, bgColor, origin, iconPath, icon192Path }) => {
  const absoluteLogo = logo 
    ? (logo.startsWith('http') ? logo : `${backendUrl}${logo.startsWith('/') ? '' : '/'}${logo}`)
    : null;

  // Always provide correctly sized PNG fallbacks. Uploaded restaurant logos are
  // optimized to WebP, so they must not be advertised as PNG icons.
  const icons = [
    {
      src: `${origin}${iconPath}`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: `${origin}${icon192Path}`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    }
  ];

  if (absoluteLogo) {
    const logoType = /\.webp(?:$|\?)/i.test(absoluteLogo) ? 'image/webp' : 'image/png';
    icons.push({
      src: absoluteLogo,
      sizes: '512x512',
      type: logoType,
      purpose: 'any maskable'
    });
  }

  // Resolve startUrl: if relative, prepend the frontend request origin to avoid cross-origin mismatch blocks
  const resolvedStartUrl = startUrl.startsWith('http') 
    ? startUrl 
    : `${origin}${startUrl.startsWith('/') ? '' : '/'}${startUrl}`;

  const resolvedScope = scope
    ? (scope.startsWith('http') ? scope : `${origin}${scope.startsWith('/') ? '' : '/'}${scope}`)
    : resolvedStartUrl;

  return {
    id: resolvedStartUrl,
    scope: resolvedScope,
    name,
    short_name: shortName,
    description: desc,
    start_url: resolvedStartUrl,
    display: 'standalone',
    background_color: bgColor || '#ffffff',
    theme_color: themeColor || '#003b1b',
    icons
  };
};

// GET /api/manifest/:slug (Diner App)
router.get('/:slug', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

    const name = restaurant.brandingSettings?.pwaName || restaurant.name;
    const logo = restaurant.logo; // Always use the main restaurant logo
    const themeColor = restaurant.brandColor || '#003b1b';
    const requestOrigin = req.query.origin || process.env.CLIENT_HOST;

    const manifest = buildManifest({
      name,
      shortName: name,
      desc: restaurant.brandingSettings?.tagline || `Order online from ${restaurant.name}`,
      startUrl: `/menu/${restaurant.slug}`,
      logo,
      themeColor,
      bgColor: '#ffffff',
      origin: requestOrigin,
      iconPath: '/icon-512.png',
      icon192Path: '/icon-192.png'
    });

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/manifest/:slug/waiter
router.get('/:slug/waiter', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

    const name = restaurant.brandingSettings?.waiterAppName || `${restaurant.name} Waiter`;
    const logo = restaurant.logo; // Always use the main restaurant logo
    const themeColor = restaurant.brandColor || '#0f172a';
    const requestOrigin = req.query.origin || process.env.WAITER_HOST;

    const manifest = buildManifest({
      name,
      shortName: name,
      desc: `Service terminal for ${restaurant.name} staff`,
      startUrl: `/waiter/${restaurant.slug}`,
      logo,
      themeColor,
      bgColor: '#0f172a',
      origin: requestOrigin,
      iconPath: '/waiter/icon-512.png',
      icon192Path: '/waiter/icon-192.png'
    });

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/manifest/:slug/kitchen
router.get('/:slug/kitchen', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

    const name = restaurant.brandingSettings?.kitchenAppName || `${restaurant.name} Kitchen`;
    const logo = restaurant.logo; // Always use the main restaurant logo
    const themeColor = restaurant.brandColor || '#0f172a';
    const requestOrigin = req.query.origin || process.env.STAFF_HOST;

    const manifest = buildManifest({
      name,
      shortName: name,
      desc: `KDS Order Monitor for ${restaurant.name} kitchen`,
      startUrl: `/admin/kitchen/${restaurant.slug}`,
      logo,
      themeColor,
      bgColor: '#0f172a',
      origin: requestOrigin,
      iconPath: '/admin/icon-512.png',
      icon192Path: '/admin/icon-192.png'
    });

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/manifest/:slug/admin
router.get('/:slug/admin', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

    const name = restaurant.brandingSettings?.adminAppName || `${restaurant.name} Admin`;
    const logo = restaurant.logo; // Always use the main restaurant logo
    const themeColor = restaurant.brandColor || '#003b1b';
    const requestOrigin = req.query.origin || process.env.STAFF_HOST;

    const manifest = buildManifest({
      name,
      shortName: name,
      desc: `Backoffice management for ${restaurant.name}`,
      startUrl: `/admin/`,
      logo,
      themeColor,
      bgColor: '#ffffff',
      origin: requestOrigin,
      iconPath: '/admin/icon-512.png',
      icon192Path: '/admin/icon-192.png'
    });

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/manifest/:slug/counter
router.get('/:slug/counter', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

    const name = restaurant.brandingSettings?.counterAppName || `${restaurant.name} Cashier`;
    const logo = restaurant.logo; // Always use the main restaurant logo
    const themeColor = restaurant.brandColor || '#003b1b';
    const requestOrigin = req.query.origin || process.env.STAFF_HOST;

    const manifest = buildManifest({
      name,
      shortName: name,
      desc: `POS Billing terminal for ${restaurant.name}`,
      startUrl: `/admin/counter/${restaurant.slug}/`,
      scope: `/admin/counter/${restaurant.slug}/`,
      logo,
      themeColor,
      bgColor: '#ffffff',
      origin: requestOrigin,
      iconPath: '/admin/icon-counter-512.png',
      icon192Path: '/admin/icon-192.png'
    });

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
