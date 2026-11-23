const mongoose = require('mongoose');

const SharedCartSchema = new mongoose.Schema({
  cartSessionId: { type: String, required: true, unique: true, index: true },
  restaurantSlug: { type: String, required: true },
  tableName: { type: String, required: true },
  tableType: { type: String, default: 'Table' },
  hostId: { type: String, required: true },
  hostName: { type: String, default: 'Host' },
  items: [{
    productId: { type: String },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 },
    image: { type: String },
    variant: { type: Object },
    selectedAddons: { type: Array, default: [] },
    notes: { type: String, default: '' },
    addedBy: { type: String, default: 'Guest' },
    addedById: { type: String }
  }],
  specialInstructions: { type: String, default: '' },
  status: { type: String, enum: ['active', 'ordered', 'expired'], default: 'active' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  createdAt: { type: Date, default: Date.now, expires: 43200 } // Auto-prune after 12 hours
}, { timestamps: true });

module.exports = mongoose.model('SharedCart', SharedCartSchema);
