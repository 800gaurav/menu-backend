const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  tableOrRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'TableOrRoom', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String },
  customerMobile: { type: String },
  source: { type: String, enum: ['customer_qr', 'takeaway', 'reception', 'counter'], default: 'customer_qr' },
  processMode: { type: String, enum: ['kitchen', 'direct'], default: 'kitchen' },
  tableName: { type: String, required: true }, // Cached name for speed, e.g. "Table 3" or "Room 101"
  items: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    variantName: { type: String },
    addons: [{
      name: { type: String },
      price: { type: Number }
    }],
    specialInstructions: { type: String }
  }],
  placedBy: { type: String, enum: ['customer', 'waiter', 'counter'], default: 'customer' },
  waiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'RestaurantAdmin' },
  subtotal: { type: Number },
  discount: { type: Number, default: 0 },
  adjustment: { type: Number, default: 0 },
  taxAmount: { type: Number },
  totalAmount: { type: Number, required: true },
  paymentStatus: { type: String, enum: ['Unpaid', 'Paid'], default: 'Unpaid' },
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
  specialInstructions: { type: String },
  servedBy: { type: String }
}, { timestamps: true });

OrderSchema.index({ restaurantId: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, tableName: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, orderNumber: 1 });

module.exports = mongoose.model('Order', OrderSchema);
