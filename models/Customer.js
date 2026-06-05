const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
  name: { type: String },
  mobile: { type: String, index: true },
  email: { type: String, index: true },
  dateOfBirth: { type: Date },
  anniversaryDate: { type: Date },
  visitCount: { type: Number, default: 0 },
  totalSpend: { type: Number, default: 0 },
  lastVisitAt: { type: Date },
  firstVisitAt: { type: Date },
  tags: [{ type: String }]
}, { timestamps: true });

CustomerSchema.index({ restaurantId: 1, mobile: 1 });
CustomerSchema.index({ restaurantId: 1, email: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);
