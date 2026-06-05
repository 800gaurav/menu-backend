const mongoose = require('mongoose');

const RestaurantAdminSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // bcrypt hash
  plainPassword: { type: String }, // stored once for superadmin view
  mobile: { type: String },
  isOnboarded: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('RestaurantAdmin', RestaurantAdminSchema);
