const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  billingCycle: { type: String, default: 'monthly', enum: ['monthly', 'yearly'] },
  features: {
    tableOrdering: { type: Boolean, default: true },
    roomOrdering: { type: Boolean, default: true },
    selfCheckout: { type: Boolean, default: true },
    kitchenPanel: { type: Boolean, default: true },
    counterPanel: { type: Boolean, default: true },
    waiterPanel: { type: Boolean, default: true },
    customerLogin: { type: Boolean, default: false },
    qrGenerator: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    maxTables: { type: Number, default: 20 },
    maxMenuItems: { type: Number, default: 100 },
    maxCategories: { type: Number, default: 15 }
  }
}, { timestamps: true });

module.exports = mongoose.model('Plan', PlanSchema);
