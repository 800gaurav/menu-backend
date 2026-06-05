const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'stitch_menu_secret_token_12345';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  if ((!authHeader || !authHeader.startsWith('Bearer ')) && !queryToken) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  const token = queryToken || authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Contains id, username, role, and restaurantId (if restaurantadmin)
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
