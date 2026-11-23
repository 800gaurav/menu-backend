const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes
router.use(authenticate, authorize(['restaurantadmin', 'counter']));

// GET /api/counter/orders - Return one compact bill group per table while preserving each order.
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find({
      restaurantId: req.user.restaurantId,
      status: 'Served'
    }).populate('customerId').populate('waiterId').sort({ createdAt: 1 });

    const grouped = new Map();
    for (const order of orders) {
      const tableName = order.tableName;
      if (!grouped.has(tableName)) {
        grouped.set(tableName, {
          _id: order._id,
          orderIds: [],
          orderNumbers: [],
          tableName,
          status: 'Served',
          billRequested: false,
          customerId: null,
          customerName: '',
          customerNames: new Set(),
          waiterId: null,
          placedBy: order.placedBy,
          orders: [],
          items: [],
          itemCount: 0,
          subtotal: 0,
          discount: 0,
          adjustment: 0,
          taxAmount: 0,
          totalAmount: 0,
          specialInstructions: '',
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        });
      }

      const group = grouped.get(tableName);
      const itemSubtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const sourceSubtotal = Number.isFinite(order.subtotal) ? order.subtotal : itemSubtotal;
      const sourceDiscount = Number(order.discount) || 0;
      const sourceAdjustment = Number(order.adjustment) || 0;
      const sourceTotal = Math.max(0, sourceSubtotal - sourceDiscount + sourceAdjustment);
      const orderSnapshot = {
        _id: order._id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.items.map(item => item.toObject()),
        subtotal: sourceSubtotal,
        discount: sourceDiscount,
        adjustment: sourceAdjustment,
        taxAmount: 0,
        totalAmount: sourceTotal,
        customerId: order.customerId,
        waiterId: order.waiterId,
        placedBy: order.placedBy,
        specialInstructions: order.specialInstructions || '',
        billRequested: order.billRequested
      };

      group.orders.push(orderSnapshot);
      group.orderIds.push(order._id);
      if (order.orderNumber) group.orderNumbers.push(order.orderNumber);
      group.billRequested = group.billRequested || order.billRequested;
      if (!group.customerId && order.customerId) group.customerId = order.customerId;
      if (!group.waiterId && order.waiterId) group.waiterId = order.waiterId;
      if (order.customerId?.name) group.customerNames.add(order.customerId.name);
      group.subtotal += orderSnapshot.subtotal;
      group.discount += orderSnapshot.discount;
      group.adjustment += orderSnapshot.adjustment;
      group.taxAmount = 0;
      group.totalAmount += orderSnapshot.totalAmount;
      if (order.specialInstructions) {
        group.specialInstructions = group.specialInstructions
          ? `${group.specialInstructions} | ${order.specialInstructions}`
          : order.specialInstructions;
      }
      group.updatedAt = order.updatedAt > group.updatedAt ? order.updatedAt : group.updatedAt;
    }

    const result = Array.from(grouped.values()).map(group => {
      group.orderNumber = group.orderNumbers.join(', ');
      group.orderCount = group.orders.length;
      group.customerName = group.customerNames.size > 1
        ? 'Multiple guests'
        : (Array.from(group.customerNames)[0] || 'Guest');
      group.items = group.orders.flatMap(order => order.items.map(item => ({
        ...item,
        sourceOrderId: order._id,
        sourceOrderNumber: order.orderNumber,
        sourceCreatedAt: order.createdAt
      })));
      group.itemCount = group.items.reduce((count, item) => count + (Number(item.quantity) || 0), 0);
      delete group.orderNumbers;
      delete group.customerNames;
      return group;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/counter/orders/grouped - Update all source orders in a table bill together.
router.put('/orders/grouped', async (req, res) => {
  try {
    const { tableName, orderIds, orders: orderEdits = [], discount = 0, adjustment = 0 } = req.body;
    if (!tableName || !Array.isArray(orderIds) || orderIds.length === 0 || !Array.isArray(orderEdits)) {
      return res.status(400).json({ message: 'A table and its active order details are required.' });
    }

    const activeOrders = await Order.find({
      restaurantId: req.user.restaurantId,
      tableName,
      status: 'Served'
    }).sort({ createdAt: 1 });
    const requestedIds = orderIds.map(String).sort();
    const activeIds = activeOrders.map(order => String(order._id)).sort();
    if (requestedIds.length !== activeIds.length || requestedIds.some((id, index) => id !== activeIds[index])) {
      return res.status(409).json({ message: 'This table bill changed. Refresh the cashier list and try again.' });
    }

    const editsById = new Map(orderEdits.map(edit => [String(edit.orderId), edit]));
    if (editsById.size !== activeOrders.length || activeOrders.some(order => !editsById.has(String(order._id)))) {
      return res.status(400).json({ message: 'Every order in this bill must be included.' });
    }

    const preparedOrders = activeOrders.map(order => {
      const edit = editsById.get(String(order._id));
      if (!Array.isArray(edit.items)) throw new Error('Each source order must include an item list.');
      const items = edit.items.map(item => ({
        menuItemId: item.menuItemId || undefined,
        name: String(item.name || '').trim(),
        price: Number(item.price),
        quantity: Number(item.quantity),
        variantName: item.variantName || undefined,
        addons: Array.isArray(item.addons) ? item.addons : [],
        specialInstructions: item.specialInstructions || undefined
      }));
      if (items.some(item => !item.name || !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        throw new Error('Items need a name, a valid price, and a quantity above zero.');
      }
      return {
        order,
        items,
        subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      };
    });

    const billSubtotal = preparedOrders.reduce((sum, item) => sum + item.subtotal, 0);
    if (preparedOrders.every(item => item.items.length === 0)) {
      return res.status(400).json({ message: 'The bill must contain at least one item.' });
    }

    const requestedDiscount = Number(discount) || 0;
    const requestedAdjustment = Number(adjustment) || 0;
    if (!Number.isFinite(requestedDiscount) || !Number.isFinite(requestedAdjustment)) {
      return res.status(400).json({ message: 'Discount and adjustment must be valid amounts.' });
    }
    const billDiscount = Math.min(Math.max(0, requestedDiscount), billSubtotal);
    const subtotalAfterDiscount = billSubtotal - billDiscount;
    const adjustedSubtotal = Math.max(0, subtotalAfterDiscount + requestedAdjustment);
    const billAdjustment = adjustedSubtotal - subtotalAfterDiscount;

    const allocate = (amount, weights) => {
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      if (!weights.length) return [];
      if (totalWeight <= 0) return weights.map((_, index) => index === 0 ? amount : 0);
      let allocated = 0;
      return weights.map((weight, index) => {
        if (index === weights.length - 1) return amount - allocated;
        const share = Math.round((amount * weight / totalWeight) * 100) / 100;
        allocated += share;
        return share;
      });
    };

    const discounts = allocate(billDiscount, preparedOrders.map(item => item.subtotal));
    const afterDiscountWeights = preparedOrders.map((item, index) => item.subtotal - discounts[index]);
    const adjustments = allocate(billAdjustment, afterDiscountWeights);
    const adjustedWeights = afterDiscountWeights.map((weight, index) => Math.max(0, weight + adjustments[index]));

    const savedOrders = [];
    for (let index = 0; index < preparedOrders.length; index += 1) {
      const prepared = preparedOrders[index];
      const order = prepared.order;
      order.items = prepared.items;
      order.subtotal = prepared.subtotal;
      order.discount = discounts[index];
      order.adjustment = adjustments[index];
      order.taxAmount = 0;
      order.totalAmount = adjustedWeights[index];
      await order.save();
      savedOrders.push(order);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(req.user.restaurantId.toString()).emit('counterBillUpdated', { tableName });
    }

    res.json({ message: 'Bill updated successfully', orders: savedOrders });
  } catch (error) {
    if (error.message.includes('Each source order') || error.message.startsWith('Items need')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/counter/orders/:id/complete - Settle bill and mark as Completed
router.post('/orders/:id/complete', async (req, res) => {
  try {
    const mainOrder = await Order.findOne({
      _id: req.params.id,
      restaurantId: req.user.restaurantId
    });

    if (!mainOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const restaurant = await Restaurant.findById(req.user.restaurantId).select('features.kitchenPanel');
    const kitchenPanelEnabled = Boolean(restaurant && restaurant.features?.kitchenPanel !== false);

    const tableOrders = await Order.find({
      restaurantId: req.user.restaurantId,
      tableName: mainOrder.tableName,
      status: 'Served'
    });

    const allOrdersToComplete = [mainOrder, ...tableOrders.filter(o => o._id.toString() !== mainOrder._id.toString())];

    const io = req.app.get('io');
    const restRoom = req.user.restaurantId.toString();

    const Customer = require('../models/Customer');
    for (const order of allOrdersToComplete) {
      const itemSubtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const subtotal = Number.isFinite(order.subtotal) ? order.subtotal : itemSubtotal;
      order.subtotal = subtotal;
      order.taxAmount = 0;
      order.totalAmount = Math.max(0, subtotal - (Number(order.discount) || 0) + (Number(order.adjustment) || 0));
      order.status = 'Completed';
      order.completedAt = new Date();
      order.paymentStatus = 'Paid';
      order.statusTimeline.push({ status: 'Completed', timestamp: new Date() });
      await order.save();

      if (order.customerId) {
        await Customer.findByIdAndUpdate(order.customerId, {
          $inc: { totalSpend: order.totalAmount },
          $set: { lastVisitAt: order.completedAt }
        });
      }

      if (io) {
        io.to(restRoom).emit('orderUpdated', order);
        if (kitchenPanelEnabled) {
          io.to(`${restRoom}_kitchen`).emit('orderUpdated', order);
        }
        io.to(order._id.toString()).emit('orderStatusChanged', order);
      }
    }

    res.json({ message: 'Table settled successfully', completedCount: allOrdersToComplete.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/counter/sales-summary - Daily summary
router.get('/sales-summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedToday = await Order.find({
      restaurantId: req.user.restaurantId,
      status: 'Completed',
      completedAt: { $gte: today }
    });

    const totalRevenue = completedToday.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageOrderVal = completedToday.length > 0 ? Math.round(totalRevenue / completedToday.length) : 0;

    res.json({
      count: completedToday.length,
      revenue: totalRevenue,
      averageValue: averageOrderVal
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
