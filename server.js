const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure CORS
app.use(cors({
  origin: '*', // For local dev and testing ease
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
const requiredEnv = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_HOST', 'WAITER_HOST', 'STAFF_HOST', 'BACKEND_URL'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}. Configure backend/.env.`);
}
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
  .then(async () => {
    console.log('MongoDB Connected successfully.');
    // One-time self-healing migration to update Completed orders with Unpaid paymentStatus to Paid
    try {
      const Order = require('./models/Order');
      const result = await Order.updateMany(
        { status: 'Completed', paymentStatus: 'Unpaid' },
        { $set: { paymentStatus: 'Paid' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`Auto-migrated: updated ${result.modifiedCount} Completed orders to paymentStatus 'Paid'.`);
      }
    } catch (migErr) {
      console.error('Failed to run one-time Completed-to-Paid order migration:', migErr);
    }

    // Auto-initialize SuperAdmin & Default Plans if database is fresh / changed
    try {
      const SuperAdmin = require('./models/SuperAdmin');
      const Plan = require('./models/Plan');
      const bcrypt = require('bcryptjs');

      const adminCount = await SuperAdmin.countDocuments();
      if (adminCount === 0) {
        const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
        const email = process.env.SUPERADMIN_EMAIL || 'superadmin@platform.com';
        const password = process.env.SUPERADMIN_PASSWORD || 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);

        await new SuperAdmin({ username, email, password: hashedPassword }).save();
        console.log(`Auto-initialized SuperAdmin (${email}) in new database.`);
      }

      const planCount = await Plan.countDocuments();
      if (planCount === 0) {
        const defaultPlans = [
          {
            name: 'Free Trial',
            price: 0,
            billingCycle: 'trial',
            trialDays: 7,
            description: '7-day full access trial for new restaurants',
            features: {
              tableOrdering: true,
              roomOrdering: true,
              selfCheckout: true,
              kitchenPanel: true,
              counterPanel: true,
              waiterPanel: true,
              customerLogin: false,
              qrGenerator: true,
              analytics: true,
              maxTables: 15,
              maxMenuItems: 50,
              maxCategories: 10
            }
          },
          {
            name: 'Starter',
            price: 999,
            billingCycle: 'monthly',
            description: 'Essential POS and QR menu for small restaurants',
            features: {
              tableOrdering: true,
              roomOrdering: false,
              selfCheckout: true,
              kitchenPanel: true,
              counterPanel: true,
              waiterPanel: false,
              customerLogin: false,
              qrGenerator: true,
              analytics: true,
              maxTables: 10,
              maxMenuItems: 50,
              maxCategories: 10
            }
          },
          {
            name: 'Professional',
            price: 2499,
            billingCycle: 'monthly',
            description: 'Full multi-panel system with waiter and kitchen KDS',
            features: {
              tableOrdering: true,
              roomOrdering: true,
              selfCheckout: true,
              kitchenPanel: true,
              counterPanel: true,
              waiterPanel: true,
              customerLogin: true,
              qrGenerator: true,
              analytics: true,
              maxTables: 30,
              maxMenuItems: 150,
              maxCategories: 25
            }
          },
          {
            name: 'Enterprise',
            price: 4999,
            billingCycle: 'yearly',
            description: 'High-volume dining for large banquet & multi-room venues',
            features: {
              tableOrdering: true,
              roomOrdering: true,
              selfCheckout: true,
              kitchenPanel: true,
              counterPanel: true,
              waiterPanel: true,
              customerLogin: true,
              qrGenerator: true,
              analytics: true,
              maxTables: 100,
              maxMenuItems: 500,
              maxCategories: 50
            }
          }
        ];
        for (const p of defaultPlans) {
          await new Plan(p).save();
        }
        console.log('Auto-initialized default subscription plans in new database.');
      }
    } catch (initErr) {
      console.error('Failed to auto-initialize SuperAdmin or Plans:', initErr);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store io in express app config to use inside routes
app.set('io', io);

// Socket.IO Room management
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join Restaurant Admin Dashboard room
  socket.on('joinRestaurant', (restaurantId) => {
    if (!restaurantId) return;
    const rId = restaurantId.toString();
    socket.join(rId);
    console.log(`Socket ${socket.id} joined restaurant room: ${rId}`);
  });

  // Support legacy / alternative room event
  socket.on('join-restaurant', (restaurantId) => {
    if (!restaurantId) return;
    const rId = restaurantId.toString();
    socket.join(rId);
    socket.join(`${rId}_kitchen`);
    console.log(`Socket ${socket.id} joined restaurant & kitchen room: ${rId}`);
  });

  // Join Kitchen Panel room (joins both kitchen room and general restaurant room)
  socket.on('joinKitchen', (restaurantId) => {
    if (!restaurantId) return;
    const rId = restaurantId.toString();
    socket.join(`${rId}_kitchen`);
    socket.join(rId);
    console.log(`Socket ${socket.id} joined kitchen room: ${rId}_kitchen & ${rId}`);
  });

  socket.on('join_kitchen', (restaurantId) => {
    if (!restaurantId) return;
    const rId = restaurantId.toString();
    socket.join(`${rId}_kitchen`);
    socket.join(rId);
    console.log(`Socket ${socket.id} joined kitchen room: ${rId}_kitchen & ${rId}`);
  });

  // Join Customer tracking room
  socket.on('joinOrder', (orderId) => {
    socket.join(orderId);
    console.log(`Socket ${socket.id} joined order room: ${orderId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Initialize Firebase Admin at startup
require('./utils/firebase');

// Import Route Handlers
const authRoutes = require('./routes/auth');
const superAdminRoutes = require('./routes/superadmin');
const restaurantRoutes = require('./routes/restaurant');
const menuRoutes = require('./routes/menu');
const tableRoutes = require('./routes/tables');
const orderRoutes = require('./routes/orders');
const customerRoutes = require('./routes/customer');
const crmRoutes = require('./routes/crm');
const analyticsRoutes = require('./routes/analytics');
const waiterRoutes = require('./routes/waiter');
const counterRoutes = require('./routes/counter');
const waitersRoutes = require('./routes/waiters');
const manifestRoutes = require('./routes/manifest');
const notificationRoutes = require('./routes/notifications');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/waiter', waiterRoutes);
app.use('/api/counter', counterRoutes);
app.use('/api/waiters', waitersRoutes);
app.use('/api/manifest', manifestRoutes);
app.use('/api/notifications', notificationRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
