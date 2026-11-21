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
  
  // Clean tokens array of nulls/undefined/empty strings
  const validTokens = tokenList.filter(t => t && typeof t === 'string');
  if (validTokens.length === 0) return;

  // Set up message payload
  const message = {
    notification: {
      title,
      body
    },
    data: Object.keys(data).reduce((acc, key) => {
      acc[key] = String(data[key]);
      return acc;
    }, {}),
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
      role: { $in: roleList }
    });
    const tokens = devTokens.map(dt => dt.token);
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
    const tokens = devTokens.map(dt => dt.token);
    if (tokens.length > 0) {
      await sendPushNotification(tokens, title, body, data);
    }
  } catch (error) {
    console.error(`Error notifying specific user ${userId}:`, error);
  }
};

module.exports = { sendPushNotification, notifyRestaurantRoles, notifySpecificUser, admin };
