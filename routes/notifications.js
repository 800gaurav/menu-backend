const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');
const { authenticate } = require('../middleware/auth');

// POST /api/notifications/register-token
router.post('/register-token', authenticate, async (req, res) => {
  const { token, role: bodyRole } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    const restaurantId = req.user.restaurantId;
    const role = req.user.role || bodyRole || 'waiter';
    const userId = req.user.id;

    if (!restaurantId) {
      return res.status(400).json({ message: 'Restaurant association required' });
    }

    // Remove any stale tokens for this user on this restaurant to prevent duplicate notifications
    if (userId) {
      await DeviceToken.deleteMany({
        userId,
        restaurantId,
        token: { $ne: token }
      });
    }

    const registerRoleOnToken = async (retries = 1) => {
      const existing = await DeviceToken.findOne({ token });
      const updatedAt = new Date();

      if (!existing) {
        try {
          return await DeviceToken.create({
            token,
            restaurantId,
            role,
            roles: [role],
            userId: userId || null,
            updatedAt
          });
        } catch (error) {
          if (error.code === 11000 && retries > 0) return registerRoleOnToken(retries - 1);
          throw error;
        }
      }

      if (String(existing.restaurantId) !== String(restaurantId)) {
        return DeviceToken.findOneAndUpdate(
          { token },
          { $set: { restaurantId, role, roles: [role], userId: userId || null, updatedAt } },
          { new: true }
        );
      }

      const knownRoles = [...new Set([...(existing.roles || []), existing.role, role].filter(Boolean))];
      return DeviceToken.findOneAndUpdate(
        { token, restaurantId },
        {
          $set: { role, userId: userId || null, updatedAt },
          $addToSet: { roles: { $each: knownRoles } }
        },
        { new: true }
      );
    };

    const devToken = await registerRoleOnToken();

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
