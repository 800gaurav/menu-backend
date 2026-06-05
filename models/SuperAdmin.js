const mongoose = require('mongoose');

const SuperAdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // bcrypt hash
  email: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('SuperAdmin', SuperAdminSchema);
