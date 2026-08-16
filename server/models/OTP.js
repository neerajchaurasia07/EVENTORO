const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },

    otp: {
        type: String,
        required: true,
        trim: true
    },

    action: {
        type: String,
        enum: ['account_verification', 'event_booking'],
        required: true
    },

    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300 // OTP automatically expires after 5 minutes
    }
});

module.exports = mongoose.model('OTP', otpSchema);