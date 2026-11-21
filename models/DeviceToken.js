const mongoose = require('mongoose');

const DeviceTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['restaurantadmin', 'kitchen', 'counter', 'waiter', 'customer']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('DeviceToken', DeviceTokenSchema);
