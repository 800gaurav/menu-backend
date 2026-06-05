const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes here
router.use(authenticate, authorize('restaurantadmin'));

// --- Categories Routes ---

// GET /api/menu/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find({ restaurantId: req.user.restaurantId }).sort({ order: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/menu/categories
router.post('/categories', async (req, res) => {
  const { name, icon, isHidden } = req.body;
  try {
    // Determine order
    const count = await Category.countDocuments({ restaurantId: req.user.restaurantId });
    const category = new Category({
      restaurantId: req.user.restaurantId,
      name,
      icon,
      isHidden: isHidden || false,
      order: count
    });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/menu/categories/:id
router.put('/categories/:id', async (req, res) => {
  const { name, icon, isHidden } = req.body;
  try {
    const category = await Category.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (name) category.name = name;
    if (icon !== undefined) category.icon = icon;
    if (isHidden !== undefined) category.isHidden = isHidden;

    await category.save();
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/menu/categories/reorder
router.put('/categories/reorder', async (req, res) => {
  const { orderList } = req.body; // Array of { id, order }
  try {
    const restaurantId = req.user.restaurantId;
    for (let item of orderList) {
      await Category.updateOne(
        { _id: item.id, restaurantId },
        { $set: { order: item.order } }
      );
    }
    res.json({ message: 'Categories reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/menu/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await Category.findOneAndDelete({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Optionally delete items belonging to this category
    await MenuItem.deleteMany({ categoryId: req.params.id, restaurantId: req.user.restaurantId });

    res.json({ message: 'Category and its menu items deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// --- Menu Items Routes ---

// GET /api/menu/items
router.get('/items', async (req, res) => {
  try {
    const items = await MenuItem.find({ restaurantId: req.user.restaurantId }).sort({ order: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/menu/items
router.post('/items', async (req, res) => {
  const { name, description, price, image, categoryId, tags, inStock, badges } = req.body;
  try {
    // Validate category exists for this restaurant
    const category = await Category.findOne({ _id: categoryId, restaurantId: req.user.restaurantId });
    if (!category) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    const count = await MenuItem.countDocuments({ restaurantId: req.user.restaurantId });
    
    const item = new MenuItem({
      restaurantId: req.user.restaurantId,
      categoryId,
      name,
      description,
      price,
      image,
      tags: tags || [],
      inStock: inStock !== undefined ? inStock : true,
      badges: badges || [],
      order: count
    });

    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/menu/items/:id
router.put('/items/:id', async (req, res) => {
  const { name, description, price, image, categoryId, tags, inStock, badges } = req.body;
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    if (categoryId) {
      const category = await Category.findOne({ _id: categoryId, restaurantId: req.user.restaurantId });
      if (!category) {
        return res.status(400).json({ message: 'Invalid category' });
      }
      item.categoryId = categoryId;
    }

    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    if (price !== undefined) item.price = price;
    if (image !== undefined) item.image = image;
    if (tags) item.tags = tags;
    if (inStock !== undefined) item.inStock = inStock;
    if (badges) item.badges = badges;

    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/menu/items/:id/toggle-stock
router.patch('/items/:id/toggle-stock', async (req, res) => {
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    item.inStock = !item.inStock;
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/menu/items/:id/duplicate
router.post('/items/:id/duplicate', async (req, res) => {
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    const count = await MenuItem.countDocuments({ restaurantId: req.user.restaurantId });
    const duplicate = new MenuItem({
      restaurantId: item.restaurantId,
      categoryId: item.categoryId,
      name: `${item.name} (Copy)`,
      description: item.description,
      price: item.price,
      image: item.image,
      tags: item.tags,
      inStock: item.inStock,
      badges: item.badges,
      order: count
    });

    await duplicate.save();
    res.status(201).json(duplicate);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/menu/items/bulk-price-update
router.post('/items/bulk-price-update', async (req, res) => {
  const { itemIds, updateType, value } = req.body; // updateType: 'percentage' | 'fixed_add' | 'fixed_set', value: Number
  try {
    const restaurantId = req.user.restaurantId;
    
    for (let id of itemIds) {
      const item = await MenuItem.findOne({ _id: id, restaurantId });
      if (item) {
        if (updateType === 'percentage') {
          item.price = Math.round(item.price * (1 + value / 100));
        } else if (updateType === 'fixed_add') {
          item.price = item.price + value;
        } else if (updateType === 'fixed_set') {
          item.price = value;
        }
        if (item.price < 0) item.price = 0;
        await item.save();
      }
    }

    res.json({ message: 'Bulk price update completed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/menu/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    const item = await MenuItem.findOneAndDelete({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
