const mongoose = require('mongoose');

const paymentStatusSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    lastPaymentDate: {
        type: Date
    },
    packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InternetPackage'
    }
}, { timestamps: true });

module.exports = mongoose.model('PaymentStatus', paymentStatusSchema); 