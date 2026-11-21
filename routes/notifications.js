const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');
const { authenticate } = require('../middleware/auth');

// POST /api/notifications/register-token
router.post('/register-token', authenticate, async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    const restaurantId = req.user.restaurantId;
    const role = req.user.role;
    const userId = req.user.id;

    if (!restaurantId) {
      return res.status(400).json({ message: 'Restaurant association required' });
    }

    // Upsert the token
    const devToken = await DeviceToken.findOneAndUpdate(
      { token },
      {
        token,
        restaurantId,
        role,
        userId: userId || null,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: 'Token registered successfully', devToken });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/notifications/deregister-token
router.post('/deregister-token', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    await DeviceToken.deleteOne({ token });
    res.status(200).json({ message: 'Token deregistered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
