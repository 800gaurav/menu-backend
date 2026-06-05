const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const TableOrRoom = require('../models/TableOrRoom');
const Restaurant = require('../models/Restaurant');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all routes here
router.use(authenticate, authorize('restaurantadmin'));

// Helper function to generate QR data URL
function targetFor(restaurantSlug, name, type) {
  const host = process.env.CLIENT_HOST || 'http://localhost:5173';
  const map = {
    Room: `${host}/menu/${restaurantSlug}?room=${encodeURIComponent(name)}&qrType=Room`,
    Table: `${host}/menu/${restaurantSlug}?table=${encodeURIComponent(name)}&qrType=Table`,
    Reception: `${host}/menu/${restaurantSlug}?qrType=Reception`,
    Takeaway: `${host}/menu/${restaurantSlug}?qrType=Takeaway`,
    SocialMedia: `${host}/menu/${restaurantSlug}?qrType=SocialMedia`,
    DirectMenu: `${host}/menu/${restaurantSlug}?qrType=DirectMenu`
  };
  return map[type] || map.DirectMenu;
}

async function generateQR(restaurantSlug, name, type) {
  const targetUrl = targetFor(restaurantSlug, name, type);
  try {
    // Generate base64 data URL
    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return { qrDataUrl, targetUrl };
  } catch (err) {
    console.error('QR Generation error:', err);
    return { qrDataUrl: '', targetUrl };
  }
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function zipFiles(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach((file) => {
    const name = Buffer.from(file.name);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

// GET /api/tables
router.get('/', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    const tables = await TableOrRoom.find({ restaurantId: req.user.restaurantId });
    for (const table of tables) {
      if (!table.qrCodeData && restaurant) {
        const qr = await generateQR(restaurant.slug, table.name, table.type);
        table.qrCodeData = qr.qrDataUrl;
        table.targetUrl = qr.targetUrl;
        table.printLabel = table.printLabel || `${restaurant.name} - ${table.name}`;
        await table.save();
      }
    }
    res.json(tables);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/tables
router.post('/', async (req, res) => {
  const { name, type, isActive } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Check duplicate name
    const existing = await TableOrRoom.findOne({ restaurantId: restaurant._id, name });
    if (existing) {
      return res.status(400).json({ message: `A ${type.toLowerCase()} named "${name}" already exists.` });
    }

    const qr = await generateQR(restaurant.slug, name, type);

    const tableObj = new TableOrRoom({
      restaurantId: restaurant._id,
      name,
      type: type || 'Table',
      isActive: isActive !== undefined ? isActive : true,
      printLabel: `${restaurant.name} - ${name}`,
      targetUrl: qr.targetUrl,
      qrCodeData: qr.qrDataUrl
    });

    await tableObj.save();
    res.status(201).json(tableObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/tables/:id
router.put('/:id', async (req, res) => {
  const { name, type, isActive } = req.body;
  try {
    const tableObj = await TableOrRoom.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!tableObj) {
      return res.status(404).json({ message: 'Table/Room not found' });
    }

    const restaurant = await Restaurant.findById(req.user.restaurantId);

    // If name or type changes, we regenerate the QR code
    let nameChanged = name && name !== tableObj.name;
    let typeChanged = type && type !== tableObj.type;

    if (nameChanged) tableObj.name = name;
    if (typeChanged) tableObj.type = type;
    if (isActive !== undefined) tableObj.isActive = isActive;

    if (nameChanged || typeChanged) {
      const qr = await generateQR(restaurant.slug, tableObj.name, tableObj.type);
      tableObj.qrCodeData = qr.qrDataUrl;
      tableObj.targetUrl = qr.targetUrl;
    }

    await tableObj.save();
    res.json(tableObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/tables/bulk-qr
router.post('/bulk-qr', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    const { targets = [] } = req.body;
    const created = [];
    for (const target of targets) {
      const name = target.name || target.type;
      const type = target.type || 'Table';
      const existing = await TableOrRoom.findOne({ restaurantId: restaurant._id, name });
      if (existing) {
        created.push(existing);
        continue;
      }
      const qr = await generateQR(restaurant.slug, name, type);
      created.push(await TableOrRoom.create({
        restaurantId: restaurant._id,
        name,
        type,
        isActive: true,
        printLabel: `${restaurant.name} - ${name}`,
        targetUrl: qr.targetUrl,
        qrCodeData: qr.qrDataUrl
      }));
    }
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/tables/download-zip
router.get('/download-zip', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    const targets = await TableOrRoom.find({ restaurantId: req.user.restaurantId, qrCodeData: { $ne: '' } });
    const files = [];
    targets.forEach((target) => {
      const safeName = target.name.replace(/[^a-z0-9-_]+/gi, '_');
      const qrBase64 = target.qrCodeData.split(',')[1];
      if (qrBase64) files.push({ name: `${safeName}_qr.png`, data: Buffer.from(qrBase64, 'base64') });
      files.push({
        name: `${safeName}_print.html`,
        data: `<!doctype html><html><head><meta charset="utf-8"><title>${target.name}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:32px}.card{border:1px solid #ddd;width:360px;margin:auto;padding:24px}.logo{max-width:80px;max-height:80px}.name{font-size:24px;font-weight:800}.target{font-size:18px;margin:12px}</style></head><body><div class="card">${restaurant.logo ? `<img class="logo" src="${restaurant.logo}">` : ''}<div class="name">${restaurant.name}</div><div class="target">${target.name}</div><img src="${target.qrCodeData}" width="260" height="260"><p>${target.type}</p></div></body></html>`
      });
    });
    const zip = zipFiles(files);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=qr_print_bundle.zip');
    res.send(zip);
  } catch (error) {
    res.status(500).json({ message: 'ZIP generation failed', error: error.message });
  }
});

// DELETE /api/tables/:id
router.delete('/:id', async (req, res) => {
  try {
    const tableObj = await TableOrRoom.findOneAndDelete({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!tableObj) {
      return res.status(404).json({ message: 'Table/Room not found' });
    }
    res.json({ message: 'Table/Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
