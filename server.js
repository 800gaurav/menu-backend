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
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stitch_digital_menu';
mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected successfully.'))
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
    socket.join(restaurantId);
    console.log(`Socket ${socket.id} joined restaurant room: ${restaurantId}`);
  });

  // Join Kitchen Panel room
  socket.on('joinKitchen', (restaurantId) => {
    socket.join(`${restaurantId}_kitchen`);
    console.log(`Socket ${socket.id} joined kitchen room: ${restaurantId}_kitchen`);
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
const manifestRoutes = require('./routes/manifest');

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
app.use('/api/manifest', manifestRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
