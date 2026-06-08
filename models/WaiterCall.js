const mongoose = require('mongoose');

const WaiterCallSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  tableOrRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'TableOrRoom', required: true },
  tableLabel: { type: String, required: true },
  calledAt: { type: Date, default: Date.now },
  attendedAt: { type: Date },
  isAttended: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('WaiterCall', WaiterCallSchema);
