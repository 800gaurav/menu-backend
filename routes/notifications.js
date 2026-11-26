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
    const authenticatedRole = req.user.role;
    const panelRoles = ['restaurantadmin', 'counter', 'kitchen', 'waiter'];
    // Admin credentials power the separate staff PWAs, so honor the requested
    // panel role for its scoped service-worker token. Staff credentials can
    // only register their own role.
    const role = authenticatedRole === 'restaurantadmin' && panelRoles.includes(bodyRole)
      ? bodyRole
      : authenticatedRole || bodyRole || 'waiter';
    const userId = req.user.id;

    if (!restaurantId) {
      return res.status(400).json({ message: 'Restaurant association required' });
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
          { $set: { restaurantId, role, roles: [role], disabledRoles: [], userId: userId || null, updatedAt } },
          { new: true }
        );
      }

      const disabledRoles = (existing.disabledRoles || []).filter(disabledRole => disabledRole === role);
      return DeviceToken.findOneAndUpdate(
        { token, restaurantId },
        {
          // Each panel now registers with its own service-worker scope/token.
          // Keep this token attached only to the panel that registered it so a
          // Counter token cannot also receive admin order pushes.
          $set: { role, roles: [role], disabledRoles, userId: userId || null, updatedAt }
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

// Mute push notifications by staff role on this device without affecting
// another panel role that shares the same browser installation.
router.put('/preferences', authenticate, async (req, res) => {
  const { token, enabled } = req.body;
  const role = req.user.role;
  if (!token || typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Token and enabled preference are required' });
  }
  if (!['restaurantadmin', 'counter', 'kitchen', 'waiter'].includes(role)) {
    return res.status(403).json({ message: 'This account cannot change staff notification preferences' });
  }

  try {
    const device = await DeviceToken.findOne({
      token,
      restaurantId: req.user.restaurantId,
      $or: [{ role }, { roles: role }]
    });
    if (!device) return res.status(404).json({ message: 'This device is not registered for this panel' });

    const update = enabled
      ? { $pull: { disabledRoles: role } }
      : { $addToSet: { disabledRoles: role } };
    await DeviceToken.updateOne({ _id: device._id }, update);
    return res.json({ enabled });
  } catch (error) {
    return res.status(500).json({ message: 'Could not save notification preference', error: error.message });
  }
});

// Remove just this role from a legacy shared FCM token during the transition
// to per-panel service worker scopes.
router.post('/deregister-role', authenticate, async (req, res) => {
  const { token } = req.body;
  const role = req.user.role;
  if (!token) return res.status(400).json({ message: 'Token is required' });
  if (!['restaurantadmin', 'counter', 'kitchen', 'waiter'].includes(role)) {
    return res.status(403).json({ message: 'This account cannot change staff notification subscriptions' });
  }
  try {
    const device = await DeviceToken.findOne({ token, restaurantId: req.user.restaurantId });
    if (!device) return res.json({ message: 'Legacy subscription already removed' });
    const roles = [...new Set([...(device.roles || []), device.role].filter(Boolean))].filter(item => item !== role);
    if (roles.length === 0) {
      await DeviceToken.deleteOne({ _id: device._id });
    } else {
      await DeviceToken.updateOne(
        { _id: device._id },
        { $set: { roles, role: roles[0] }, $pull: { disabledRoles: role } }
      );
    }
    return res.json({ message: 'Panel subscription migrated' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not migrate panel notification subscription', error: error.message });
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
