const mongoose = require('mongoose');

const WaiterCallSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  tableOrRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'TableOrRoom', required: true },
  tableLabel: { type: String, required: true },
  activeCallKey: { type: String, unique: true, sparse: true },
  calledAt: { type: Date, default: Date.now },
  attendedAt: { type: Date },
  isAttended: { type: Boolean, default: false }
}, { timestamps: true });

WaiterCallSchema.index({ restaurantId: 1, isAttended: 1 });

module.exports = mongoose.model('WaiterCall', WaiterCallSchema);
