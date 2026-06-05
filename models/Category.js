const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true },
  icon: { type: String }, // e.g. emoji or icon name
  order: { type: Number, default: 0 }, // For drag and drop sorting
  isHidden: { type: Boolean, default: false } // Toggle category visibility
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);
