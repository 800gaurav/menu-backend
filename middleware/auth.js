const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured. Add it to backend/.env.');
}

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  if ((!authHeader || !authHeader.startsWith('Bearer ')) && !queryToken) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  const token = queryToken || authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Contains id, username, role, and restaurantId (if restaurantadmin)
    
    if (req.user.restaurantId && req.user.role !== 'superadmin') {
      const Restaurant = require('../models/Restaurant');
      const restaurant = await Restaurant.findById(req.user.restaurantId);
      if (!restaurant || !restaurant.isActive) {
        return res.status(403).json({ message: 'This restaurant account is suspended.' });
      }
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const authorize = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }
    next();
  }
};

module.exports = { authenticate, authorize, JWT_SECRET };
