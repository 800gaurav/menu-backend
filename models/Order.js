const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  tableOrRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'TableOrRoom', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  source: { type: String, enum: ['customer_qr', 'takeaway', 'reception'], default: 'customer_qr' },
  tableName: { type: String, required: true }, // Cached name for speed, e.g. "Table 3" or "Room 101"
  items: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    specialInstructions: { type: String }
  }],
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['New', 'Accepted', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'],
    default: 'New'
  },
  priority: { type: String, enum: ['Normal', 'High', 'Rush'], default: 'Normal' },
  billRequested: { type: Boolean, default: false },
  servedAt: { type: Date },
  acceptedAt: { type: Date },
  preparingAt: { type: Date },
  readyAt: { type: Date },
  completedAt: { type: Date },
  orderNumber: { type: String }, // e.g. "ORD-1234"
  statusTimeline: [{
    status: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  specialInstructions: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
