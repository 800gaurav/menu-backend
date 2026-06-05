const mongoose = require('mongoose');

const TableOrRoomSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true }, // e.g. "Table 1", "Room 101", "Rooftop"
  type: { type: String, enum: ['Table', 'Room', 'DirectMenu', 'Reception', 'Takeaway', 'SocialMedia'], default: 'Table' },
  isActive: { type: Boolean, default: true },
  printLabel: { type: String },
  targetUrl: { type: String },
  qrCodeData: { type: String } // Base64 or generated URL
}, { timestamps: true });

module.exports = mongoose.model('TableOrRoom', TableOrRoomSchema);
