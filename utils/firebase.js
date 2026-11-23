const admin = require('firebase-admin');
const { cert, getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');

const keyPath = path.join(__dirname, '..', 'config', 'firebase-service-account.json');

let isInitialized = false;

if (fs.existsSync(keyPath)) {
  try {
    const serviceAccount = require(keyPath);
    if (!getApps().some((app) => app.name === '[DEFAULT]')) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    isInitialized = true;
    console.log('Firebase Admin Initialized successfully.');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
} else {
  console.warn('Firebase Service Account key not found. FCM notifications are disabled.');
}

const sendPushNotification = async (tokens, title, body, data = {}) => {
  if (!isInitialized) {
    console.warn('Cannot send push notification: Firebase Admin not initialized.');
    return;
  }
  if (!tokens || (Array.isArray(tokens) && tokens.length === 0)) return;

  const tokenList = Array.isArray(tokens) ? tokens : [tokens];
  
  // Clean tokens array of nulls/undefined/empty strings and deduplicate
  const validTokens = [...new Set(tokenList.filter(t => t && typeof t === 'string'))];
  if (validTokens.length === 0) return;

  // Determine tag for notification deduplication in Chrome/browsers
  const tag = data.orderId
    ? `${data.type === 'order_ready' ? 'order-ready' : data.type?.startsWith('new_order') ? 'new-order' : `order-${data.type || 'update'}`}-${data.orderId}`
    : (data.callId
      ? `call-${data.callId}`
      : (data.alertId ? `alert-${data.alertId}` : 'menuos-alert'));

  const stringData = Object.keys(data).reduce((acc, key) => {
    acc[key] = String(data[key]);
    return acc;
  }, {});
  if (!stringData.tag) stringData.tag = tag;

  // Set up message payload with webpush config so Chrome deduplicates identical alerts
  const message = {
    notification: {
      title,
      body
    },
    data: stringData,
    webpush: {
      headers: {
        Urgency: 'high'
      },
      notification: {
        title,
        body,
        icon: '/icon-512.png',
        badge: '/icon-512.png',
        tag,
        renotify: false,
        silent: false,
        vibrate: [180, 80, 180],
        timestamp: Date.now(),
        data: stringData
      }
    },
    tokens: validTokens
  };

  try {
    const response = await getMessaging(getApp()).sendEachForMulticast(message);
    console.log(`${response.successCount} push notifications sent successfully.`);
    
    // Clean up expired/invalid tokens
    if (response.failureCount > 0) {
      const DeviceToken = require('../models/DeviceToken');
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          if (error && (
            error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered'
          )) {
            tokensToRemove.push(validTokens[idx]);
          }
        }
      });
      if (tokensToRemove.length > 0) {
        await DeviceToken.deleteMany({ token: { $in: tokensToRemove } });
        console.log(`Cleaned up ${tokensToRemove.length} expired FCM registration tokens.`);
      }
    }
  } catch (error) {
    console.error('Error sending multicast push notification:', error);
  }
};

const notifyRestaurantRoles = async (restaurantId, roles, title, body, data = {}) => {
  try {
    const DeviceToken = require('../models/DeviceToken');
    const roleList = Array.isArray(roles) ? roles : [roles];
    const devTokens = await DeviceToken.find({
      restaurantId,
      $or: [
        { role: { $in: roleList } },
        { roles: { $in: roleList } }
      ]
    });
    const tokens = [...new Set(devTokens.map(dt => dt.token).filter(Boolean))];
    if (tokens.length > 0) {
      await sendPushNotification(tokens, title, body, data);
    }
  } catch (error) {
    console.error(`Error notifying restaurant roles ${roles}:`, error);
  }
};

const notifySpecificUser = async (restaurantId, userId, title, body, data = {}) => {
  try {
    const DeviceToken = require('../models/DeviceToken');
    const devTokens = await DeviceToken.find({
      restaurantId,
      userId
    });
    const tokens = [...new Set(devTokens.map(dt => dt.token).filter(Boolean))];
    if (tokens.length > 0) {
      await sendPushNotification(tokens, title, body, data);
    }
  } catch (error) {
    console.error(`Error notifying specific user ${userId}:`, error);
  }
};

module.exports = { sendPushNotification, notifyRestaurantRoles, notifySpecificUser, admin };
