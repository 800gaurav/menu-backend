const mongoose = require('mongoose');

const QRScanSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
  tableOrRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'TableOrRoom' },
  qrType: { type: String, default: 'DirectMenu' },
  targetName: { type: String },
  userAgent: { type: String },
  ip: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('QRScan', QRScanSchema);
