const mongoose = require('mongoose');

const MenuItemSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  image: { type: String }, // Uploaded photo local path / url
  tags: [{ type: String, enum: ['Veg', 'Non-Veg', 'Vegan'] }],
  inStock: { type: Boolean, default: true },
  badges: [{ type: String, enum: ['Best Seller', 'Chef\'s Special', 'New'] }],
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', MenuItemSchema);
