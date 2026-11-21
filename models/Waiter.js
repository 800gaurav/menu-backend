const mongoose = require('mongoose');

const WaiterSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true },
  pin: { type: String, required: true }, // 4 digit passcode
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure PIN is unique per restaurant
WaiterSchema.index({ restaurantId: 1, pin: 1 }, { unique: true });

module.exports = mongoose.model('Waiter', WaiterSchema);
