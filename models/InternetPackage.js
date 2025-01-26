const mongoose = require('mongoose');

const internetPackageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    speed: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('InternetPackage', internetPackageSchema); 